
import type { Report, CodeData, Ship } from '../types';

export const exportReportsToExcel = async (reports: Report[], codes: CodeData) => {
    if (!reports.length) return;

    // Dynamically import XLSX
    const XLSX = await import('xlsx');

    // Define Headers
    const headers = [
        'ID (Do Not Edit)',
        'Ship (R001)',
        'Event Code',
        'M Code',
        'Event Time',
    ];

    // Add T-Codes (Time)
    const tCodes = codes.tCodes.map(c => ({ code: c.code, label: `${c.code} (${c.name})` }));
    tCodes.forEach(c => headers.push(c.label));

    // Add R-Codes (Items)
    const rCodes = codes.rCodes.map(c => ({ code: c.code, label: `${c.code} (${c.name})` }));
    rCodes.forEach(c => headers.push(c.label));

    // Verify and Collect Dynamic Columns (CONS_, RH_, and Legacy R133_)
    const dynamicKeys = new Set<string>();
    reports.forEach(r => {
        Object.keys(r.items).forEach(k => {
            if (k.startsWith('CONS_')) dynamicKeys.add(k);
            if (k.startsWith('RH_')) dynamicKeys.add(k);
            if (k.startsWith('R133_')) dynamicKeys.add(k);
        });
    });
    const sortedDynamicKeys = Array.from(dynamicKeys).sort();

    // Add Dynamic Columns to Headers
    sortedDynamicKeys.forEach(k => {
        if (k.startsWith('CONS_')) {
            const parts = k.split('_');
            if (parts.length === 4) {
                const [_, eCode, unit, fCode] = parts;
                const eName = codes.eCodes.find(e => e.code === eCode)?.name || eCode;
                const fName = codes.fCodes.find(f => f.code === fCode)?.name || fCode;
                headers.push(`${k} (${eName} NO.${unit} - ${fName})`);
            } else {
                headers.push(k);
            }
        } else if (k.startsWith('RH_')) {
            // Format: RH_RCode_ECode_Unit
            const parts = k.split('_');
            if (parts.length === 4) {
                const [_, rCode, eCode, unit] = parts;
                const rName = codes.rCodes.find(r => r.code === rCode)?.name || rCode;
                const eName = codes.eCodes.find(e => e.code === eCode)?.name || eCode;
                headers.push(`${k} (${eName} NO.${unit} ${rName})`);
            } else {
                headers.push(k);
            }
        } else if (k.startsWith('R133_')) {
            // Legacy R133 Format: R133_Unit
            const parts = k.split('_');
            const unit = parts[1];
            const rName = codes.rCodes.find(r => r.code === 'R133')?.name || 'Total Revo';
            headers.push(`${k} (${rName} NO.${unit})`);
        } else {
            headers.push(k);
        }
    });

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
        tCodes.forEach(tc => {
            row[tc.label] = report.tasks?.[tc.code] || '';
        });

        // Fill R-Codes
        rCodes.forEach(rc => {
            // Skip Expanded Base Codes if they are not stored directly (optional, but R133 is stored as items in NewReport?? No, NewReport stores R133_1)
            // If NewReport stores base R133 for single engine, we keep it. 
            row[rc.label] = report.items?.[rc.code] ? String(report.items?.[rc.code]) : '';
        });

        // Fill Dynamic Columns
        sortedDynamicKeys.forEach(k => {
            // Find header label for this key loop above... simplified for row matching
            // We need to match the EXACT header string generated above.
            // This is inefficient O(N^2). Better to map key -> label first.
            // Re-implement simplified matching or strictly reuse label logic.
            let label = k;
            if (k.startsWith('CONS_')) {
                const parts = k.split('_');
                if (parts.length === 4) {
                    const [_, eCode, unit, fCode] = parts;
                    const eName = codes.eCodes.find(e => e.code === eCode)?.name || eCode;
                    const fName = codes.fCodes.find(f => f.code === fCode)?.name || fCode;
                    label = `${k} (${eName} NO.${unit} - ${fName})`;
                }
            } else if (k.startsWith('RH_')) {
                const parts = k.split('_');
                if (parts.length === 4) {
                    const [_, rCode, eCode, unit] = parts;
                    const rName = codes.rCodes.find(r => r.code === rCode)?.name || rCode;
                    const eName = codes.eCodes.find(e => e.code === eCode)?.name || eCode;
                    label = `${k} (${eName} NO.${unit} ${rName})`;
                }
            } else if (k.startsWith('R133_')) {
                const parts = k.split('_');
                const unit = parts[1];
                const rName = codes.rCodes.find(r => r.code === 'R133')?.name || 'Total Revo';
                label = `${k} (${rName} NO.${unit})`;
            }

            row[label] = report.items?.[k] ? String(report.items[k]) : '';
        });

        return row;
    });

    // Create Worksheet
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reports');

    // Download
    XLSX.writeFile(wb, `Event_Reports_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const generateExcelTemplate = async (codes: CodeData, ships?: Ship[]) => {
    // Dynamically import XLSX
    const XLSX = await import('xlsx');

    // Calculate Max Equipment Counts & Fuels
    let maxMeCount = 1; // Default to 1

    // Map to store max count and fuels for each equipment
    const eqConfig = new Map<string, { maxCount: number, fuels: Set<string> }>();

    if (ships) {
        ships.forEach(ship => {
            const me = ship.equipment?.find(e => e.code === 'E01' && e.installed);
            if (me && me.count > maxMeCount) {
                maxMeCount = me.count;
            }

            // General Equipment Scan
            ship.equipment?.forEach(e => {
                if (!e.installed) return;
                if (!eqConfig.has(e.code)) {
                    eqConfig.set(e.code, { maxCount: 0, fuels: new Set() });
                }
                const conf = eqConfig.get(e.code)!;
                if (e.count > conf.maxCount) conf.maxCount = e.count;
                e.validFuels?.forEach(f => conf.fuels.add(f));
            });
        });
    }

    // MAP from NewReport.tsx for Generic Expansion
    const RH_MAP: Record<string, string[]> = {
        'R067': ['E01'], // ME R/H -> M/E
        'R078': ['E01'], // M/E Power
        'R070': ['E01'], // Stop.Eng -> M/E
        'R133': ['E01'], // Total Rev -> M/E (handled specifically for legacy match but kept here for ref)
        'R037': ['E01'], // Start Counter -> M/E
        'R085': ['E02', 'E05'], // BLR R/H -> M/BLR or A/BLR
        'R113': ['E03'], // Gen R/H -> D/G
        'R114': ['E03'], // D/G Power
        'R115': ['E09'], // Shaft Gen R/H -> Shaft/Gen
        'R152': ['E09'], // Shaft Gen Power
        'R155': ['E04'], // Turb Gen R/H -> T/G
        'R156': ['E04'], // T/G Power
        'R112': ['E10'], // ALS -> ALS
    };

    // Define Expandable Codes (Fuel Items)
    const FUEL_EXPAND_CODES = ['R030', 'R031', 'R056', 'R057', 'R058'];

    // Define Headers
    const headers = [
        'ID (Do Not Edit)',
        'Ship (R001)',
        'Event Code',
        'M Code',
        'Event Time (YYYY-MM-DD HH:mm)',
    ];

    // Add T-Codes (Time)
    const tCodes = codes.tCodes.map(c => ({ code: c.code, label: `${c.code} (${c.name})` }));
    tCodes.forEach(c => headers.push(c.label));

    // Add R-Codes (Items) with Expansion Logic
    codes.rCodes.forEach(r => {
        // 1. Generic RH_MAP Expansion (Includes R133, R113, etc.)
        if (RH_MAP[r.code]) {
            const allowedEq = RH_MAP[r.code];
            // Find max count for these equipments across ships
            allowedEq.forEach(eqCode => {
                const conf = eqConfig.get(eqCode);
                if (conf && conf.maxCount > 0) {
                    const eName = codes.eCodes.find(e => e.code === eqCode)?.name || eqCode;
                    for (let i = 1; i <= conf.maxCount; i++) {
                        // Format: RH_RCode_ECode_Unit
                        const key = `RH_${r.code}_${eqCode}_${i}`;
                        headers.push(`${key} (${eName} NO.${i} ${r.name})`);
                    }
                }
            });
        }
        // 2. Fuel Expansion
        else if (FUEL_EXPAND_CODES.includes(r.code) && codes.fCodes.length > 0) {
            codes.fCodes.forEach(f => {
                headers.push(`${r.code}_${f.code} (${r.name} - ${f.name})`);
            });
        }
        // 3. Standard
        else {
            headers.push(`${r.code} (${r.name})`);
        }
    });

    // Add CONS_ Columns (Equipment Fuel Breakdown)
    const sortedEqCodes = Array.from(eqConfig.keys()).sort();
    sortedEqCodes.forEach(eCode => {
        const conf = eqConfig.get(eCode)!;
        if (conf.fuels.size > 0 && conf.maxCount > 0) {
            const eName = codes.eCodes.find(e => e.code === eCode)?.name || eCode;
            const sortedFuels = Array.from(conf.fuels).sort();

            for (let i = 1; i <= conf.maxCount; i++) {
                sortedFuels.forEach(fCode => {
                    const fName = codes.fCodes.find(f => f.code === fCode)?.name || fCode;
                    // Key: CONS_ECode_Unit_FCode
                    const key = `CONS_${eCode}_${i}_${fCode}`;
                    headers.push(`${key} (${eName} NO.${i} - ${fName})`);
                });
            }
        }
    });

    // Create Empty Data with Headers only
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');

    XLSX.writeFile(wb, 'Event_Report_Template.xlsx');
};

export const parseExcelReports = async (file: File): Promise<Partial<Report>[]> => {
    // Dynamically import XLSX
    const XLSX = await import('xlsx');

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
                        id: row['ID (Do Not Edit)']?.toString() || undefined, // Allow new reports (no ID)
                        evCode: row['Event Code']?.toString() || '',
                        mCode: row['M Code']?.toString() || '',
                        tasks: {},
                        items: {},
                    };

                    // Parse Custom Fields
                    Object.keys(row).forEach(header => {
                        const value = row[header]?.toString() || '';
                        if (!value) return; // Skip empty string

                        // Check if header is T-Code
                        if (header.startsWith('T') && header.includes('(')) {
                            const code = header.split(' ')[0]; // Extract 'T001'

                            // Check for Excel Serial Date (Numeric) or String looking like number
                            if (typeof row[header] === 'number') {
                                // Convert Serial to ISO
                                const serial = row[header];
                                const utc_days = Math.floor(serial - 25569);
                                const utc_value = utc_days * 86400;
                                const date_info = new Date(utc_value * 1000);

                                const fractional_day = serial - Math.floor(serial) + 0.0000001;
                                const total_seconds = Math.floor(86400 * fractional_day);
                                const seconds = total_seconds % 60;
                                const minutes = Math.floor(total_seconds / 60) % 60;
                                const hours = Math.floor(total_seconds / 3600);

                                date_info.setUTCSeconds(seconds);
                                date_info.setUTCMinutes(minutes);
                                date_info.setUTCHours(hours);

                                const isoStr = date_info.toISOString().slice(0, 16).replace('T', ' ');
                                if (report.tasks) report.tasks[code] = isoStr;
                            } else {
                                if (report.tasks) report.tasks[code] = value;
                            }
                        }

                        // Check if header is R-Code
                        else if (header.startsWith('R') && header.includes('(')) {
                            const codeParts = header.split(' ')[0];
                            if (codeParts.includes('_')) {
                                // Potentially expanded code R133_1, etc.
                                // We keep the full key for items
                                if (report.items) report.items[codeParts] = value;
                            } else {
                                if (report.items) report.items[codeParts] = value;
                            }
                        }

                        // Check if header is CONS_ or RH_
                        else if (header.startsWith('CONS_') || header.startsWith('RH_')) {
                            const code = header.split(' ')[0];
                            if (report.items) report.items[code] = value;
                        }

                        // Special case for Ship (R001) helper
                        else if (header === 'Ship (R001)') {
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
