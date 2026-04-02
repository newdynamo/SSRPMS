const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8500;

const multer = require('multer');
const csv = require('csv-parser');
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// --- PTO Analysis High-Speed Engine Configuration ---
const PTO_DATA_DIR = path.join(__dirname, 'data', 'pto_summaries');
if (!fs.existsSync(PTO_DATA_DIR)) fs.mkdirSync(PTO_DATA_DIR, { recursive: true });

const getPtoFilePath = (reportId) => {
    if (!reportId || reportId === 'null' || reportId === 'undefined') {
        return path.join(__dirname, 'data', 'pto_summary.json');
    }
    return path.join(PTO_DATA_DIR, `pto_${reportId}.json`);
};

// Helper to read JSON
const readJson = (fileName) => {
    const filePath = path.join(__dirname, 'data', fileName);
    if (!fs.existsSync(filePath)) return [];
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`Error reading ${fileName}:`, err);
        return [];
    }
};

// PTO Data API: Get
app.get('/api/pto/data', async (req, res) => {
    const { reportId } = req.query;
    const filePath = getPtoFilePath(reportId);
    
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'No PTO data found' });
        }
        const data = await fs.promises.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Failed to read PTO data' });
    }
});

// PTO Data API: Upload & High-Speed Aggregation
app.post('/api/pto/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const results = [];
    let rowCount = 0;
    const SAMPLING_INTERVAL = 30;
    let lastProcessedIndex = -1;
    let lastRowObj = null;

    // Persisted column keys for performance
    let tsKey = null;
    let ptoKey = null;
    let esdKey = null;
    let portRpmKey = null, portKwKey = null, stbdRpmKey = null, stbdKwKey = null;

    const cleanHead = (s) => s.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    const parseSignal = (val) => {
        if (val === undefined || val === null || val === '') return 0;
        const n = parseFloat(val);
        if (!isNaN(n)) return n >= 0.5 ? 1 : 0;
        const v = val.toString().trim().toLowerCase();
        return ['true', 'on', 'active', 'run', 'yes', '1'].includes(v) ? 1 : 0;
    };

    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
            rowCount++;
            
            // Identification phase (Row 1)
            if (rowCount === 1) {
                const keys = Object.keys(row);
                const ptoKeywords = ['ptoactive', 'ptoen', 'pto', 'active', 'running'];
                const esdKeywords = ['esd', 'emergency', 'stop', 'shutdown', 'trigger'];
                const tsKeywords = ['timestamp', 'time', 'date'];

                tsKey = keys.find(k => tsKeywords.some(w => cleanHead(k).includes(w))) || keys[0];
                ptoKey = keys.find(k => ptoKeywords.some(w => cleanHead(k).includes(w)));
                esdKey = keys.find(k => esdKeywords.some(w => cleanHead(k).includes(w)));

                const isShaftMatch = (c, typeKeywords, num) => {
                    const clean = cleanHead(c);
                    return clean.includes('shaft') && typeKeywords.some(tk => clean.includes(tk)) && clean.includes(num);
                };
                
                stbdKwKey = keys.find(k => isShaftMatch(k, ['power', 'kw', 'load'], '1'));
                stbdRpmKey = keys.find(k => isShaftMatch(k, ['speed', 'rpm'], '1'));
                portKwKey = keys.find(k => isShaftMatch(k, ['power', 'kw', 'load'], '2'));
                portRpmKey = keys.find(k => isShaftMatch(k, ['speed', 'rpm'], '2'));

                const isMatch = (c, keysA, keysB) => keysA.some(a => c.includes(a)) && keysB.some(b => c.includes(b));
                if (!portRpmKey) portRpmKey = keys.find(k => isMatch(cleanHead(k), ['port', 'me1', 'engine1'], ['rpm', 'speed']));
                if (!portKwKey) portKwKey = keys.find(k => isMatch(cleanHead(k), ['port', 'me1', 'engine1'], ['power', 'kw', 'load']));
                if (!stbdRpmKey) stbdRpmKey = keys.find(k => isMatch(cleanHead(k), ['stbd', 'starboard', 'me2', 'engine2'], ['rpm', 'speed']));
                if (!stbdKwKey) stbdKwKey = keys.find(k => isMatch(cleanHead(k), ['stbd', 'starboard', 'me2', 'engine2'], ['power', 'kw', 'load']));
            }

            const p = processRow(row, rowCount);
            if (p) {
                // Include row if: it's a sampling point OR ESD is triggered
                if (rowCount % SAMPLING_INTERVAL === 0 || rowCount === 1 || p.esdTrigger === 1) {
                    lastProcessedIndex = rowCount;
                    results.push(p);
                }
            }
            lastRowObj = row;
        })
        .on('end', async () => {
            // Ensure the very last row is always included in the summary
            if (lastRowObj && lastProcessedIndex !== rowCount) {
                const p = processRow(lastRowObj, rowCount);
                if (p) results.push(p);
            }
            try {
                // Ensure results are sorted
                results.sort((a, b) => a.timestamp - b.timestamp);
                
                const { reportId } = req.body;
                const filePath = getPtoFilePath(reportId);
                await fs.promises.writeFile(filePath, JSON.stringify(results));
                
                // Cleanup temp file
                fs.unlinkSync(req.file.path);
                
                res.json({ 
                    success: true, 
                    count: results.length, 
                    originalRows: rowCount,
                    message: `Processed ${rowCount} rows into ${results.length} summary points.` 
                });
            } catch (err) {
                console.error('Error saving PTO summary:', err);
                res.status(500).json({ error: 'Failed to process CSV' });
            }
        })
        .on('error', (err) => {
            console.error('CSV Parsing error:', err);
            res.status(500).json({ error: 'CSV Parsing failed' });
        });
});

// PTO Data API: Delete
app.delete('/api/pto/data', async (req, res) => {
    const { reportId } = req.query;
    const filePath = getPtoFilePath(reportId);
    
    try {
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete PTO data' });
    }
});

// --- API Routes ---

// Get all ships
app.get('/api/ships', async (req, res) => {
    try {
        const data = await fs.promises.readFile(path.join(__dirname, 'data', 'ships.json'), 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        // If file doesn't exist, return empty array
        res.json([]);
    }
});

// Update ships (Add/Delete/Modify)
app.post('/api/ships', async (req, res) => {
    try {
        const newShips = req.body;
        await fs.promises.writeFile(path.join(__dirname, 'data', 'ships.json'), JSON.stringify(newShips, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving ships:', err);
        res.status(500).json({ error: 'Failed to save ships' });
    }
});

// Get all Ports
app.get('/api/ports', async (req, res) => {
    try {
        const data = await fs.promises.readFile(path.join(__dirname, 'data', 'ports.json'), 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.json([]);
    }
});

// Update Ports
app.post('/api/ports', async (req, res) => {
    try {
        const ports = req.body;
        await fs.promises.writeFile(path.join(__dirname, 'data', 'ports.json'), JSON.stringify(ports, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving ports:', err);
        res.status(500).json({ error: 'Failed to save ports' });
    }
});

// Get all Codes
app.get('/api/codes', async (req, res) => {
    const readSafe = async (filename) => {
        try {
            const data = await fs.promises.readFile(path.join(__dirname, 'data', filename), 'utf8');
            return JSON.parse(data);
        } catch (e) {
            console.warn(`Warning: Could not load ${filename}, returning empty array.`);
            return [];
        }
    };

    const mCodes = await readSafe('m_codes.json');
    const evCodes = await readSafe('ev_codes.json');
    const tCodes = await readSafe('t_codes.json');
    const rCodes = await readSafe('r_codes.json');
    const eCodes = await readSafe('e_codes.json');
    const fCodes = await readSafe('f_codes.json');
    const lCodes = await readSafe('l_codes.json');
    const wCodes = await readSafe('w_codes.json');

    res.json({ mCodes, evCodes, tCodes, rCodes, eCodes, fCodes, lCodes, wCodes });
});
// Update EV-Codes
app.post('/api/ev-codes', async (req, res) => {
    try {
        const codes = req.body;
        await fs.promises.writeFile(path.join(__dirname, 'data', 'ev_codes.json'), JSON.stringify(codes, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving EV-Codes:', err);
        res.status(500).json({ error: 'Failed to save EV-Codes' });
    }
});

// Update T-Codes

// Update T-Codes
app.post('/api/t-codes', async (req, res) => {
    try {
        const codes = req.body;
        await fs.promises.writeFile(path.join(__dirname, 'data', 't_codes.json'), JSON.stringify(codes, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving T-Codes:', err);
        res.status(500).json({ error: 'Failed to save T-Codes' });
    }
});

// Update R-Codes
app.post('/api/r-codes', async (req, res) => {
    try {
        const codes = req.body;
        await fs.promises.writeFile(path.join(__dirname, 'data', 'r_codes.json'), JSON.stringify(codes, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving R-Codes:', err);
        res.status(500).json({ error: 'Failed to save R-Codes' });
    }
});

// Get/Save Reports
app.get('/api/reports', async (req, res) => {
    try {
        const reportsPath = path.join(__dirname, 'data', 'reports.json');
        const data = await fs.promises.readFile(reportsPath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.json([]);
    }
});

app.post('/api/reports', async (req, res) => {
    try {
        const report = { id: Date.now().toString(), ...req.body, submittedAt: new Date().toISOString() };

        let reports = [];
        const reportsPath = path.join(__dirname, 'data', 'reports.json');

        try {
            const data = await fs.promises.readFile(reportsPath, 'utf8');
            reports = JSON.parse(data);
        } catch (e) {
            // File might not exist yet
        }

        reports.push(report);
        await fs.promises.writeFile(reportsPath, JSON.stringify(reports, null, 2));

        res.json({ success: true, reportId: report.id });
    } catch (err) {
        console.error('Error saving report:', err);
        res.status(500).json({ error: 'Failed to save report' });
    }
});

// Delete Report
app.delete('/api/reports/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const reportsPath = path.join(__dirname, 'data', 'reports.json');

        const data = await fs.promises.readFile(reportsPath, 'utf8');
        let reports = JSON.parse(data);

        const initialLength = reports.length;
        reports = reports.filter(r => r.id !== id);

        if (reports.length === initialLength) {
            return res.status(404).json({ error: 'Report not found' });
        }

        await fs.promises.writeFile(reportsPath, JSON.stringify(reports, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting report:', err);
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

// Delete Reports by Ship
app.delete('/api/reports', async (req, res) => {
    const { ship } = req.query;
    if (!ship) {
        return res.status(400).json({ error: 'Ship name required' });
    }

    const targetShip = ship.trim().toUpperCase();
    const reportsPath = path.join(__dirname, 'data', 'reports.json');

    const maxRetries = 3;
    let attempt = 0;

    const performDelete = async () => {
        try {
            const data = await fs.promises.readFile(reportsPath, 'utf8');
            let reports = JSON.parse(data);

            const initialLength = reports.length;
            reports = reports.filter(r => {
                const reportShip = r.items?.['R001']?.trim().toUpperCase();
                return reportShip !== targetShip;
            });
            
            const deletedCount = initialLength - reports.length;

            // Simple retry logic for Windows EBUSY
            while (attempt < maxRetries) {
                try {
                    await fs.promises.writeFile(reportsPath, JSON.stringify(reports, null, 2));
                    return res.json({ success: true, deletedCount });
                } catch (writeErr) {
                    if (writeErr.code === 'EBUSY' && attempt < maxRetries - 1) {
                        attempt++;
                        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
                        continue;
                    }
                    throw writeErr;
                }
            }
        } catch (err) {
            console.error('Error deleting reports by ship:', err);
            res.status(500).json({ error: `Failed to delete reports: ${err.message}` });
        }
    };

    await performDelete();
});

// Update Report
app.put('/api/reports/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        const reportsPath = path.join(__dirname, 'data', 'reports.json');

        const data = await fs.promises.readFile(reportsPath, 'utf8');
        let reports = JSON.parse(data);

        const index = reports.findIndex(r => r.id === id);
        if (index === -1) {
            return res.status(404).json({ error: 'Report not found' });
        }

        // Merge existing report with updates, ensuring ID and original submittedAt stay (unless explicitly overridden if needed)
        // We preserve the original ID. submittedAt is up to the client or can be updated here if we want "updatedAt" logic.
        // For now, simple merge.
        reports[index] = { ...reports[index], ...updatedData, id };

        await fs.promises.writeFile(reportsPath, JSON.stringify(reports, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating report:', err);
        res.status(500).json({ error: 'Failed to update report' });
    }
});

// Get Market Data
app.get('/api/market', async (req, res) => {
    try {
        const data = await fs.promises.readFile(path.join(__dirname, 'data', 'market_data.json'), 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.json([]);
    }
});

// Get Ship Custom Fields
app.get('/api/ship-custom-fields', async (req, res) => {
    try {
        const data = await fs.promises.readFile(path.join(__dirname, 'data', 'ship_custom_fields.json'), 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.json([]);
    }
});

// Update Ship Custom Fields
app.post('/api/ship-custom-fields', async (req, res) => {
    try {
        const fields = req.body;
        await fs.promises.writeFile(path.join(__dirname, 'data', 'ship_custom_fields.json'), JSON.stringify(fields, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving ship custom fields:', err);
        res.status(500).json({ error: 'Failed to save ship custom fields' });
    }
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
