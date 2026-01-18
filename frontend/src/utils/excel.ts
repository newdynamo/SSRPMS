import * as XLSX from 'xlsx';
import type { Report, CodeData } from '../types';

// Constants shared with NewReport.tsx (duplicated to ensure stability)
const RH_MAP: Record<string, string[]> = {
    'R067': ['E01'], // ME R/H
    'R078': ['E01'], // M/E Power
    'R070': ['E01'], // Stop.Eng
    'R133': ['E01'], // Total Rev
    'R037': ['E01'], // Start Counter
    'R085': ['E02', 'E05'], // BLR R/H -> M/BLR or A/BLR
    'R113': ['E03'], // Gen R/H -> D/G
    'R114': ['E03'], // D/G Power
    'R115': ['E09'], // Shaft Gen R/H
    'R152': ['E09'], // Shaft Gen Power
    'R155': ['E04'], // Turb Gen R/H
    'R156': ['E04'], // T/G Power
    'R112': ['E10'], // ALS
};

const TANK_MAP: Record<string, 'cargo' | 'ballast'> = {
    'R091': 'cargo',    // Cargo Tank Temp
    'R098': 'cargo',    // Tank Pressure
    'R151': 'cargo',    // Tank Pressure (LNG)
    'R053': 'ballast',  // Ballast Qty
};

// Safe defaults for template generation if not dynamically available
const MAX_TANK_COUNT = { cargo: 24, ballast: 30 };

// Helper to get max count from ECode numberRange (e.g. "1-4" -> 4)
const getMaxCount = (range: string) => {
    if (!range) return 1;
    const parts = range.split('-');
    if (parts.length > 1) return parseInt(parts[1], 10) || 1;
    return parseInt(parts[0], 10) || 1;
};

// Generate All Possible Headers based on Codes
const generateHeaders = (codes: CodeData): string[] => {
    const headers = [
        'ID (Do Not Edit)',
        'Ship (R001)',
        'Event Code',
        'M Code',
        'Event Time',
    ];

    // T-Codes
    codes.tCodes.forEach(c => headers.push(`${c.code} (${c.name})`));

    // R-Codes (Expanded)
    codes.rCodes.forEach(r => {
        // 1. Check RH_MAP (Equipment Expansion)
        const rhEqCodes = RH_MAP[r.code];
        if (rhEqCodes) {
            rhEqCodes.forEach(eCode => {
                const eData = codes.eCodes.find(e => e.code === eCode);
                const max = eData ? getMaxCount(eData.numberRange) : 1;
                for (let i = 1; i <= max; i++) {
                    // Key Format: RH_<RCode>_<ECode>_<UnitNum>
                    // Label: <RCode> - <EName> #<UnitNum>
                    headers.push(`RH_${r.code}_${eCode}_${i} (${r.name} - ${eData?.name || eCode} #${i})`);
                }
            });
            return; // Skip default R-Code addition
        }

        // 2. Check TANK_MAP
        const tankType = TANK_MAP[r.code];
        if (tankType) {
            const max = MAX_TANK_COUNT[tankType];
            for (let i = 1; i <= max; i++) {
                // Key Format: TANK_<RCode>_<Type>_<UnitNum>
                headers.push(`TANK_${r.code}_${tankType}_${i} (${r.name} - ${tankType} #${i})`);
            }
            return;
        }

        // 3. Fuel Status (R030, R056)
        if (['R030', 'R056'].includes(r.code)) {
            codes.fCodes.forEach(f => {
                // Key Format: <RCode>_<FCode>
                headers.push(`${r.code}_${f.code} (${r.name} - ${f.name})`);
            });
            // Also Lube Oils for R030? (Actually R030 is usually Fuel ROB, Lubricants have own codes e.g. R126)
            // But if R030 is used broadly, we stick to Fuels for now as per NewReport logic.
            return;
        }

        // 4. Consumption (R031) - The Big One
        if (r.code === 'R031') {
            // Expands by Equipment AND Fuel
            // We iterate all ECodes that consume fuel (Hard to know exactly without 'applicability', assuming broad set based on common sense or iterate ALL)
            // But let's use the ones referenced in RH_MAP + others?
            // Actually, any equipment could consume fuel.
            // Let's iterate ALL eCodes.
            codes.eCodes.forEach(e => {
                const max = getMaxCount(e.numberRange);
                for (let i = 1; i <= max; i++) {
                    codes.fCodes.forEach(f => {
                        // Key Format: CONS_<ECode>_<UnitNum>_<FCode>
                        headers.push(`CONS_${e.code}_${i}_${f.code} (${r.name} - ${e.name} #${i} - ${f.name})`);
                    });
                }
            });
            return;
        }

        // Default
        headers.push(`${r.code} (${r.name})`);
    });

    return headers;
};

export const exportReportsToExcel = (reports: Report[], codes: CodeData) => {
    if (!reports.length) return;

    const headers = generateHeaders(codes);

    // Prepare Data
    const data = reports.map(report => {
        const row: Record<string, string | number> = {
            'ID (Do Not Edit)': report.id || '',
            'Ship (R001)': report.items['R001'] ? String(report.items['R001']) : '',
            'Event Code': report.evCode,
            'M Code': report.mCode,
            'Event Time': getEventTimeIso(report),
        };

        // Fill T-Codes
        codes.tCodes.forEach(tc => {
            const key = `${tc.code} (${tc.name})`;
            row[key] = report.tasks?.[tc.code] || '';
        });

        // Fill R-Codes and Expanded Keys
        // We iterate headers to find keys because mappings are complex
        // Wait, efficient way: Helper to map Header -> Property Access
        // But headers contain the "Key" at the start: "RH_R067_E01_1 (...)"
        // So we can extract the key from the header and look it up in report.items
        headers.forEach(header => {
            if (row[header] !== undefined) return; // Skip already filled (Tasks/Metadata)

            const key = header.split(' ')[0]; // Extract Key logic
            // Check if key exists directly in items (Works for R001, RH_..., CONS_..., TANK_...)
            if (report.items && report.items[key] !== undefined) {
                row[header] = String(report.items[key]);
            } else {
                row[header] = '';
            }
        });

        return row;
    });

    // Create Worksheet
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reports');

    XLSX.writeFile(wb, `Event_Reports_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const generateExcelTemplate = (codes: CodeData) => {
    const headers = generateHeaders(codes);

    // Create Empty Data with Headers only
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');

    XLSX.writeFile(wb, 'Event_Report_Template.xlsx');
};

export const parseExcelReports = async (file: File): Promise<Partial<Report>[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const reports: Partial<Report>[] = jsonData.map((row: any) => {
                    const report: Partial<Report> = {
                        id: row['ID (Do Not Edit)']?.toString() || undefined,
                        evCode: row['Event Code']?.toString() || '',
                        mCode: row['M Code']?.toString() || '',
                        tasks: {},
                        items: {},
                    };

                    Object.keys(row).forEach(header => {
                        const value = row[header]?.toString() || '';
                        if (!value) return;

                        // Identify Key from Header
                        // Header format: "KEY (Label)" or "KEY"
                        const key = header.split(' ')[0];

                        // T-Codes
                        if (key.startsWith('T') && key.length <= 4 && !key.includes('_')) { // Simple T001 check
                            if (report.tasks) report.tasks[key] = value;
                        }
                        // R-Codes & Expanded Keys
                        // They all live in report.items, so we just map Key -> Value
                        // EXCEPT Metadata keys defined at top
                        else if (
                            !['ID', 'Ship', 'Event', 'M', 'Date'].some(p => header.startsWith(p)) &&
                            (key.startsWith('R') || key.startsWith('RH_') || key.startsWith('CONS_') || key.startsWith('TANK_'))
                        ) {
                            if (report.items) report.items[key] = value;
                        }

                        // Special case for Ship (R001) if it uses the readable header
                        if (header.startsWith('Ship (R001)')) {
                            if (report.items) report.items['R001'] = value;
                        }
                    });

                    return report;
                });

                resolve(reports);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
};

const getEventTimeIso = (report: Report): string => {
    if (report.tasks) {
        const taskTime = Object.entries(report.tasks)
            .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
            .find(([k, v]) => k.startsWith('T') && k !== 'T46' && v)?.[1];
        if (taskTime) return taskTime;
    }
    return report.submittedAt || '';
};
