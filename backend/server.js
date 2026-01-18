const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 8500;

app.use(cors());
app.use(express.json());

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

// --- APIs ---

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

// Verify Server
app.get('/', (req, res) => {
    res.send('SSRPMS Backend is Running on Port ' + PORT);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
