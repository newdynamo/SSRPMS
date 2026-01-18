
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchCodes } from '../api/codes';
import { fetchReports, submitReport, updateReport } from '../api/reports';
import { fetchShips } from '../api/ships';
import type { CodeData, TCode, RCode, Report, Ship } from '../types/index';
import { ChevronRight, Clock, Ship as ShipIcon, Anchor, CheckCircle, History, ChevronDown } from 'lucide-react';
import { cn } from '../utils/cn';

// Custom DateTime Input Component
const DateTimeInput = ({ value, onChange, placeholder }: { value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, placeholder?: string }) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    const formatDisplay = (val: string) => {
        if (!val) return '';
        // val is typically YYYY-MM-DDTHH:mm
        return val.replace('T', ' ').replace(/-/g, '.');
    };

    const handleClick = () => {
        try {
            if (inputRef.current && typeof inputRef.current.showPicker === 'function') {
                inputRef.current.showPicker();
            } else {
                inputRef.current?.focus(); // Fallback
            }
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="relative w-full group" onClick={handleClick}>
            <div className={cn(
                "w-full bg-ocean-900 border border-ocean-600 rounded-lg px-4 py-3 text-left transition-all group-hover:border-primary-500/50 flex items-center justify-between cursor-pointer",
                value ? "text-white" : "text-slate-500"
            )}>
                <span className="font-mono text-lg tracking-wide select-none">
                    {value ? formatDisplay(value) : (placeholder || 'YYYY.MM.DD --:--')}
                </span>
                <Clock size={18} className={cn("transition-colors", value ? "text-primary-400" : "text-slate-600")} />
            </div>
            <input
                ref={inputRef}
                type="datetime-local"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                value={value ? value.replace(' ', 'T') : ''}
                onChange={onChange}
            />
        </div>
    );
};

// Helper: Resolve Ship Configuration (Inheritance)
const resolveShipConfig = (targetShip: Ship, allShips: Ship[]): Ship => {
    if (targetShip.configSourceShipId) {
        const sourceShip = allShips.find(s => s.code === targetShip.configSourceShipId);
        if (sourceShip) {
            console.log(`Resolving config for ${targetShip.name} from ${sourceShip.name}`);
            return {
                ...targetShip,
                // Merge structure from Source with Values (ROB) from Target
                equipment: sourceShip.equipment, // Equipment is structural
                fuels: sourceShip.fuels?.map(srcF => {
                    const targetF = targetShip.fuels?.find(t => t.code === srcF.code);
                    return { ...srcF, initialRob: targetF?.initialRob ?? srcF.initialRob };
                }),
                lubeOils: sourceShip.lubeOils?.map(srcL => {
                    const targetL = targetShip.lubeOils?.find(t => t.code === srcL.code);
                    return { ...srcL, initialRob: targetL?.initialRob ?? srcL.initialRob };
                }),
                waters: sourceShip.waters?.map(srcW => {
                    const targetW = targetShip.waters?.find(t => t.code === srcW.code);
                    return { ...srcW, initialRob: targetW?.initialRob ?? srcW.initialRob };
                }),
                tankCounts: sourceShip.tankCounts // Tank counts are structural
            };
        }
    }
    return targetShip;
};

const NewReport: React.FC = () => {
    const navigate = useNavigate();
    const [codes, setCodes] = useState<CodeData | null>(null);
    const [step, setStep] = useState<number>(1);
    const [searchParams] = useSearchParams();
    const editId = searchParams.get('edit');
    const isEditMode = !!editId;

    // Selection State
    const [selectedEVCode, setSelectedEVCode] = useState<string | null>(null);
    const [taskValues, setTaskValues] = useState<Record<string, string>>({});
    const [itemValues, setItemValues] = useState<Record<string, string | number>>({});
    const [lastReport, setLastReport] = useState<Report | null>(null);
    // 2. Add ships/activeShip state
    const [ships, setShips] = useState<Ship[]>([]);
    const [activeShip, setActiveShip] = useState<Ship | null>(null);
    const [allReports, setAllReports] = useState<Report[]>([]); // Store all reports
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

    const toggleSection = (section: string) => {
        setCollapsedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    // State for One Engine Operation Mode (Calculation Toggle)
    const [isOneEngineOp, setIsOneEngineOp] = useState(false);

    // Aggregation Effect: Sum Per-Equipment Consumption -> Total Consumption (R031)
    useEffect(() => {
        if (!activeShip || !activeShip.fuels) return;

        const newItemValues = { ...itemValues };
        let hasChanges = false;

        // Auto-fill Vessel Name (R001) if empty or different
        // Using 'name' from ship config
        const targetVesselName = activeShip.name;
        if (newItemValues['R001'] !== targetVesselName) {
            newItemValues['R001'] = targetVesselName;
            hasChanges = true;
        }

        // Initialize totals map
        const fuelTotals: Record<string, number> = {};
        activeShip.fuels.forEach(f => fuelTotals[f.code] = 0);

        // Sum up CONS keys
        Object.keys(itemValues).forEach(key => {
            if (key.startsWith('CONS_')) {
                // Key format: CONS_{eqCode}_{unitNum}_{fCode}
                const parts = key.split('_');
                const fCode = parts[parts.length - 1]; // fCode is last
                const val = parseFloat(itemValues[key] as string || '0');

                if (fuelTotals[fCode] !== undefined) {
                    fuelTotals[fCode] += val;
                }
            }
        });

        // Update R031_Fxx fields
        Object.entries(fuelTotals).forEach(([fCode, total]) => {
            const r031Key = `R031_${fCode}`;
            const formatted = total.toFixed(2);

            if (newItemValues[r031Key] !== formatted) {
                newItemValues[r031Key] = formatted;
                hasChanges = true;
            }
        });

        if (hasChanges) {
            setItemValues(newItemValues);
        }
    }, [itemValues, activeShip]);

    // Auto-Calculation Effect (ROB)
    useEffect(() => {
        if (!activeShip || !lastReport) return;

        const ROB_CODE = 'R030';
        const CONS_CODE = 'R031';
        const BUNKER_CODE = 'R056';

        const newItemValues = { ...itemValues };
        let hasChanges = false;

        activeShip.fuels?.forEach(fuel => {
            const fCode = fuel.code;
            const robKey = `${ROB_CODE}_${fCode}`;
            const consKey = `${CONS_CODE}_${fCode}`;
            const bunkerKey = `${BUNKER_CODE}_${fCode}`;

            // Get Previous ROB: From Last Report OR Initial Config
            let prevRob = 0;
            if (lastReport && lastReport.items?.[robKey]) {
                prevRob = parseFloat(lastReport.items[robKey] as string);
            } else {
                // Fallback to Initial ROB from Ship Config
                prevRob = fuel.initialRob || 0;
            }

            // Get Current Values
            const consumption = parseFloat(newItemValues[consKey] as string || '0');
            const bunker = parseFloat(newItemValues[bunkerKey] as string || '0');

            // Calculate New ROB
            const newRob = Math.max(0, prevRob - consumption + bunker);
            const formattedRob = newRob.toFixed(2); // Keep 2 decimals

            // Only update if value is different
            if (newItemValues[robKey] !== formattedRob) {
                newItemValues[robKey] = formattedRob;
                hasChanges = true;
            }
        });

        // WATER CALCULATION
        if (activeShip.waters) {
            const WATER_ROB_CONFIG: Record<string, { rob: string, minus: string[], plus: string[] }> = {
                'W01': { rob: 'R127', minus: ['R123'], plus: ['R032', 'R033', 'R138'] },
                'W02': { rob: 'R158', minus: ['R157'], plus: ['R159'] },
                'W03': { rob: 'R129', minus: ['R128'], plus: ['R130'] }
            };

            activeShip.waters.forEach(water => {
                const config = WATER_ROB_CONFIG[water.code];
                if (!config) return;

                // Get Previous ROB
                let prevRob = 0;
                if (lastReport && lastReport.items?.[config.rob]) {
                    prevRob = parseFloat(lastReport.items[config.rob] as string);
                } else {
                    prevRob = water.initialRob || 0;
                }

                // Calculate Net Change
                let change = 0;
                config.minus.forEach(code => change -= parseFloat(newItemValues[code] as string || '0'));
                config.plus.forEach(code => change += parseFloat(newItemValues[code] as string || '0'));

                const newRob = Math.max(0, prevRob + change);
                const formatted = newRob.toFixed(2);

                if (newItemValues[config.rob] !== formatted) {
                    newItemValues[config.rob] = formatted;
                    hasChanges = true;
                }
            });
        }

        // L.O CALCULATION
        if (activeShip.lubeOils) {
            // Mapping: LCode -> { rob: R126_Lxx, cons: R124_Lxx, sup: R122_Lxx }
            // Note: R-Codes in r_codes.json are generic (R126, R124, R122). 
            // We use suffixes specific to the L-Code (e.g., _L01).

            activeShip.lubeOils.forEach(lo => {
                const lCode = lo.code;
                const robKey = `R126_${lCode}`;
                const consKey = `R124_${lCode}`;
                const supKey = `R122_${lCode}`;

                // Get Previous ROB: From Last Report OR Initial Config
                let prevRob = 0;
                if (lastReport && lastReport.items?.[robKey]) {
                    prevRob = parseFloat(lastReport.items[robKey] as string);
                } else {
                    prevRob = lo.initialRob || 0;
                }

                // Get Current Values
                const consumption = parseFloat(newItemValues[consKey] as string || '0');
                const supplied = parseFloat(newItemValues[supKey] as string || '0');

                // Calculate New ROB
                const newRob = Math.max(0, prevRob - consumption + supplied);
                const formattedRob = newRob.toFixed(2);

                // Only update if value is different
                if (newItemValues[robKey] !== formattedRob) {
                    newItemValues[robKey] = formattedRob;
                    hasChanges = true;
                }
            });
        }

        if (hasChanges) {
            setItemValues(newItemValues);
        }
    }, [itemValues, activeShip, lastReport]);

    // ENG.MILE Auto-Calculation
    useEffect(() => {
        if (!activeShip) return;

        // 1. Identify Codes
        const TOTAL_REVO_CODE = 'R133';
        const STOP_REVO_CODE = 'R201';
        const START_REVO_CODE = 'R037';

        // Find Eng.Mile code dynamically (looks for "Eng.Mile" or specific port/stbd if needed)
        // We look for a code named exactly "Eng.Mile" first, then fallback to others if needed.
        // Based on user request, it's likely "Eng.Mile".
        const engMileCode = codes?.rCodes?.find(r =>
            ['Today Eng.Mile', 'Eng.Mile', 'Eng.Mile(STBD)'].includes(r.name)
        )?.code;

        if (!engMileCode) return;

        // 2. Get Propeller Pitch from Custom Values
        // "Propeller Pitch" is the key in customValues
        const pitchStr = activeShip.customValues?.['Propeller Pitch'];
        const pitch = parseFloat(pitchStr || '0');

        // If pitch is not defined or 0, we cannot calculate
        if (!pitch) return;

        // 3. Get Current Revo (Total or Stop)
        // Priority: R133 (Total) > R201 (Stop)
        // CHECK FOR MULTIPLE ENGINES (M/E)
        const meEq = activeShip.equipment?.find(e => e.code === 'E01' && e.installed);
        const isMultiMe = meEq && meEq.count > 1;

        let diffToday = 0;
        let diffTotal = 0; // For Total Mile

        if (isMultiMe) {
            // MULTI-ENGINE LOGIC
            let totalDiffSum = 0;
            let totalCurrentSum = 0; // Just for Total calculation if valid
            let activeEnginesForAvg = isMultiMe ? meEq.count : 1; // Divisor for Average

            for (let i = 1; i <= meEq.count; i++) {
                const key = `${TOTAL_REVO_CODE}_${i}`;
                const curStr = itemValues[key];
                // Fallback to single key if missing? No, user enters split data.
                if (curStr) {
                    const cur = parseFloat(curStr.toString());
                    totalCurrentSum += cur;

                    // Get Last Report Value
                    let lastVal = 0;
                    if (lastReport) {
                        // Try split key first, then fallback to single R133 (legacy data migration)
                        // If migrating from 1 -> 2, R133 might exist. But hard to split. 
                        // Assume user manages transition for first report.
                        const lastStr = lastReport.items?.[key];
                        if (lastStr) {
                            lastVal = parseFloat(lastStr.toString());
                        }
                    }

                    if (cur > 0 && lastVal > 0) {
                        const d = cur - lastVal;
                        if (d >= 0) totalDiffSum += d;
                    }
                }
            }

            // Calculation Strategy
            // 1. One Engine Operation (Sum)
            // 2. Normal (Average)
            if (isOneEngineOp) {
                diffToday = totalDiffSum; // SUM
            } else {
                diffToday = totalDiffSum / activeEnginesForAvg; // AVERAGE
            }

            // Note: Total Eng.Mile logic for multi-engine is complex (needs multi-start revs). 
            // For now, disabling Total Eng.Mile auto-calc for Multi-Engine unless explicitly requested.
            // Or use similar average logic?

        } else {
            // SINGLE ENGINE LOGIC (Legacy)
            let currentRevoStr = itemValues[TOTAL_REVO_CODE] || itemValues[STOP_REVO_CODE];
            if (!currentRevoStr) return; // No current revo entered yet
            const currentRevo = parseFloat(currentRevoStr.toString());

            let lastReportTotal = 0;
            if (lastReport) {
                const lastTotal = lastReport.items?.[TOTAL_REVO_CODE];
                const lastStop = lastReport.items?.[STOP_REVO_CODE];
                const lastRevoStr = lastTotal || lastStop;
                if (lastRevoStr) {
                    lastReportTotal = parseFloat(lastRevoStr.toString());
                }
            }
            if (lastReportTotal > 0) {
                diffToday = currentRevo - lastReportTotal;
            }

            // Total Logic
            let startRevo = 0;
            const inputStartStr = itemValues[START_REVO_CODE];
            if (inputStartStr) {
                startRevo = parseFloat(inputStartStr.toString());
            }
            diffTotal = currentRevo - startRevo;
        }

        // Find Total Eng.Mile code dynamically (looks for "Total Eng.Mile" or "Distance" or "Distance(STBD)" etc)
        const totalEngMileCode = codes?.rCodes?.find(r =>
            ['Total Eng.Mile', 'Distance', 'Distance(STBD)'].includes(r.name)
        )?.code;

        // 5. Calculate "Today Eng.Mile" (Distance from Last Report)
        // Formula: (Current - LastReportTotal) * Pitch

        if (engMileCode && diffToday >= 0) { // Using calculated diffToday from above
            const todayMileVal = diffToday * pitch;
            // Additional check: If One Engine Op, wait, logic handled in diffToday calculation.

            const formattedToday = todayMileVal.toFixed(2);
            if (itemValues[engMileCode] !== formattedToday) {
                setItemValues(prev => ({ ...prev, [engMileCode]: formattedToday }));
            }
        }

        // 6. Calculate "Total Eng.Mile" (Distance from Start Revs)
        // Formula: (Current - StartRevo) * Pitch
        if (totalEngMileCode && !isMultiMe && diffTotal >= 0) { // Only for single engine for now
            // Note: If startRevo is 0 (missing input), this becomes absolute total (Current * Pitch)
            const totalMileVal = diffTotal * pitch;
            const formattedTotal = totalMileVal.toFixed(2);

            setItemValues(prev => {
                if (prev[totalEngMileCode] !== formattedTotal) {
                    return { ...prev, [totalEngMileCode]: formattedTotal };
                }
                return prev;
            });
        }

        // 7. Calculate "Today Slip"
        // Formula: (TodayEngMile - TodayDistance) / TodayEngMile * 100
        const todayDistCode = codes?.rCodes?.find(r => r.name === 'Today Distance' || r.code === 'R013')?.code;
        const todaySlipCode = codes?.rCodes?.find(r => r.name === 'Today Slip' || r.name === 'Slip' || r.code === 'R081')?.code;

        if (engMileCode && todayDistCode && todaySlipCode) {
            const todayEngMileStr = itemValues[engMileCode];
            const todayDistStr = itemValues[todayDistCode];

            // Only calculate if we have values
            if (todayEngMileStr) {
                const todayEngMile = parseFloat(todayEngMileStr.toString());
                const todayDist = todayDistStr ? parseFloat(todayDistStr.toString()) : 0;

                if (todayEngMile > 0) {
                    const slip = ((todayEngMile - todayDist) / todayEngMile) * 100;
                    const formattedSlip = slip.toFixed(2);

                    setItemValues(prev => {
                        if (prev[todaySlipCode] !== formattedSlip) {
                            return { ...prev, [todaySlipCode]: formattedSlip };
                        }
                        return prev;
                    });
                }
            }
        }

    }, [itemValues, activeShip, lastReport, codes, isOneEngineOp]); // Add isOneEngineOp dependency

    // OPERATION TIME (R200) Auto-Calculation
    useEffect(() => {
        if (!lastReport) return;

        // Helper to parse date/time string to timestamp (Local Time basis for calculation)
        const getTimestamp = (dateStr: string | undefined): number => {
            if (!dateStr) return 0;
            const d = new Date(dateStr.toString().replace(' ', 'T'));
            return isNaN(d.getTime()) ? 0 : d.getTime();
        };

        // Helper to get UTC from Report Items (Priority: R004 > R003 - ZD)
        const resolveUtcTime = (items: Record<string, string | number> | undefined): number => {
            if (!items) return 0;

            // 1. Try R004 (UTC)
            const utcTs = getTimestamp(String(items['R004'] || ''));
            if (utcTs > 0) return utcTs;

            // 2. Fallback: R003 (LT) - ZD
            const ltTs = getTimestamp(String(items['R003'] || ''));
            const zdStr = items['R009']?.toString();
            if (ltTs > 0 && zdStr !== undefined && zdStr !== '') {
                const zd = parseFloat(zdStr);
                if (!isNaN(zd)) {
                    return ltTs - (zd * 60 * 60 * 1000);
                }
            }
            return 0;
        };

        const lastUtcTime = resolveUtcTime(lastReport.items);
        const currentUtcTime = resolveUtcTime(itemValues);

        // 3. Calculate Difference
        if (lastUtcTime > 0 && currentUtcTime > 0) {
            const diffMs = currentUtcTime - lastUtcTime;

            // Allow calculation even if diff is effectively 0 or small positive
            // Usually op time > 0. If very small, might equal 0.
            if (diffMs >= 0) {
                const diffHours = diffMs / (1000 * 60 * 60);
                const formatted = diffHours.toFixed(2);

                if (itemValues['R200'] !== formatted) {
                    setItemValues(prev => ({ ...prev, 'R200': formatted }));
                }
            }
        }
    }, [itemValues['R004'], itemValues['R003'], itemValues['R009'], lastReport]);

    // Effect: Update lastReport when activeShip or Date changes (Date-Sensitive History)
    useEffect(() => {
        if (!activeShip || allReports.length === 0) {
            setLastReport(null);
            return;
        }

        const currentDateStr = itemValues['R003'] as string;

        // Helper to parse date string (YYYY-MM-DD HH:mm to TS)
        const parseDate = (d: string | undefined) => {
            if (!d) return 0;
            const date = new Date(d.replace(' ', 'T'));
            return isNaN(date.getTime()) ? 0 : date.getTime();
        };

        const currentTs = parseDate(currentDateStr) || Date.now();

        // Filter reports:
        // 1. Same Ship
        // 2. Not the current report (if editing)
        // 3. Event Date (R003) is strictly BEFORE current report date
        const candidates = allReports.filter(r => {
            if (r.items['R001'] !== activeShip.name) return false;
            if (editId && r.id === editId) return false;

            const rDate = r.items['R003'] as string || r.submittedAt;
            const rTs = parseDate(rDate);

            return rTs < currentTs;
        });

        if (candidates.length > 0) {
            // Sort descending by Event Date (primary) or SubmittedAt (secondary)
            candidates.sort((a, b) => {
                const tA = parseDate(a.items['R003'] as string || a.submittedAt);
                const tB = parseDate(b.items['R003'] as string || b.submittedAt);
                return tB - tA;
            });
            setLastReport(candidates[0]);
        } else {
            setLastReport(null);
        }
    }, [activeShip, allReports, itemValues['R003'], editId]);

    // Effect: Update T46 when lastReport changes
    useEffect(() => {
        if (lastReport) {
            // T46: Last Event Report
            const lastDate = lastReport.items['R003'] as string || lastReport.submittedAt || '';
            const lastEv = lastReport.evCode;
            const t46Value = `${lastDate} (${lastEv})`;

            // T46 is Priority 1, so it should be in taskValues or itemValues?
            // checking t_codes.json, T46 is a T-Code. So it goes to taskValues.
            setTaskValues(prev => ({
                ...prev,
                'T46': t46Value
            }));
        } else {
            setTaskValues(prev => ({
                ...prev,
                'T46': ''
            }));
        }
    }, [lastReport]);

    useEffect(() => {
        const load = async () => {
            try {
                // 3. Fetch ships in useEffect
                const [codeData, reportData, shipData] = await Promise.all([
                    fetchCodes(),
                    fetchReports(),
                    fetchShips()
                ]);
                setCodes(codeData);
                setAllReports(reportData); // Store all reports

                // 3. Set ships and activeShip
                setShips(shipData);
                if (shipData.length > 0) {
                    setActiveShip(resolveShipConfig(shipData[0], shipData)); // Default to first ship
                }

                // HANDLE EDIT MODE
                if (editId) {
                    const reportToEdit = reportData.find(r => r.id === editId);
                    if (reportToEdit) {
                        // 1. Set Active Ship
                        const shipName = reportToEdit.items['R001'] as string;

                        const ship = shipData.find(s => s.name === shipName);
                        if (ship) setActiveShip(resolveShipConfig(ship, shipData));

                        // 2. Set Values
                        setSelectedEVCode(reportToEdit.evCode);
                        setTaskValues(reportToEdit.tasks || {});
                        setItemValues(reportToEdit.items || {});

                        // 3. Skip to Step 2
                        setStep(2);
                    }
                }

            } catch (err) {
                console.error("Failed to load data", err);
            }
        };
        load();
    }, [editId]);

    const handleShipChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedName = e.target.value;

        const selectedShip = ships.find(s => s.name === selectedName);
        if (selectedShip) {
            setActiveShip(resolveShipConfig(selectedShip, ships));
        }
    };

    /**
     * Helper to perform Time Auto-Calculation Logic
     * Returns a new itemValues object (or null if no change needed)
     */
    const calculateTimeUpdates = (currentItems: Record<string, string | number>, changedCode: string, changedValue: string): Record<string, string | number> | null => {
        if (!['R003', 'R004', 'R009'].includes(changedCode)) return null;

        const newItems = { ...currentItems, [changedCode]: changedValue };
        let hasCalculated = false;

        try {
            // Helpers
            const parseDate = (str: string) => {
                if (!str) return null;
                const clean = str.replace(' ', 'T');
                const d = new Date(clean);
                return isNaN(d.getTime()) ? null : d;
            };
            const formatDate = (date: Date) => {
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const hh = String(date.getHours()).padStart(2, '0');
                const min = String(date.getMinutes()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
            };

            const ltStr = newItems['R003'] as string;
            const utcStr = newItems['R004'] as string;
            const zdStr = newItems['R009'] as string;

            const lt = parseDate(ltStr);
            const utc = parseDate(utcStr);
            const zd = parseFloat(zdStr);

            // Case 1: ZD Changed -> Update UTC (if LT exists)
            if (changedCode === 'R009' && !isNaN(zd) && lt) {
                const newUtc = new Date(lt.getTime() - (zd * 60 * 60 * 1000));
                newItems['R004'] = formatDate(newUtc);
                hasCalculated = true;
            }
            // Case 2: LT Changed -> Update UTC (if ZD exists)
            else if (changedCode === 'R003' && lt && !isNaN(zd)) {
                const newUtc = new Date(lt.getTime() - (zd * 60 * 60 * 1000));
                newItems['R004'] = formatDate(newUtc);
                hasCalculated = true;
            }
            // Case 3: UTC Changed -> Update ZD (if LT exists)
            else if (changedCode === 'R004' && utc && lt) {
                const diffMs = lt.getTime() - utc.getTime();
                const diffHours = diffMs / (1000 * 60 * 60);
                newItems['R009'] = String(Math.round(diffHours * 10) / 10);
                hasCalculated = true;
            }
        } catch (err) {
            console.warn("Auto-calc error", err);
        }

        return hasCalculated ? newItems : null;
    };

    // SYNC: Auto-populate R003 (LT) from T-Code Event Time
    useEffect(() => {
        if (!codes?.tCodes) return;

        // Find the "primary" event time.
        // Rule: Start with 'T', exclude 'T46' (Last Event), prioritize lower numbers like T01-T10 if needed.
        // For now, let's find the T-Code associated with the Event that is likely the event time.
        // Or simply iterate through taskValues and pick the first valid 'T' code that has a value.

        // Better approach based on "Event Report's date and time":
        // Usually there is a specific T-code for the event time, often 'T01', 'T02', 'T04' etc depending on event.
        // Let's check the current event's valid T-Codes.
        const ev = codes.evCodes.find(e => e.code === selectedEVCode);
        if (!ev || !ev.validTCodes) return;

        // Filter for T-codes, sort by priority (usually strictly defined).
        // Get T-Code objects (sorted)
        const timeTCodes = ev.validTCodes
            .filter(code => code.startsWith('T') && code !== 'T46')
            .sort()
            .map(c => codes.tCodes.find(t => t.code === c))
            .filter((t): t is TCode => !!t);

        let sourceValue = '';

        for (const t of timeTCodes) {
            const code = t.code;
            let val = taskValues[code];

            // AUTO-FILL DEFAULT: Noon Report Logic (Fixed 12:00)
            // If value is missing, but it's a Noon report, populate the default.
            if (!val && ['EV05', 'EV06'].includes(ev.code) && t.name.toLowerCase().includes('noon')) {
                const datePart = new Date().toISOString().split('T')[0];
                val = `${datePart} 12:00`;

                // Update taskValues to persist this default (triggers re-render)
                setTaskValues(prev => ({ ...prev, [code]: val }));
                return; // Exit to wait for re-render with new value
            }

            if (val) {
                sourceValue = val as string;
                break; // Stop at first found time
            }
        }

        if (sourceValue) {
            // Check if R003 needs update
            if (itemValues['R003'] !== sourceValue) {
                // Update R003
                let nextItems = { ...itemValues, 'R003': sourceValue };

                // TRIGGER AUTO CALC (LT -> UTC/ZD)
                // Treat this as if R003 just changed
                const autoCalculated = calculateTimeUpdates(nextItems, 'R003', sourceValue);
                if (autoCalculated) {
                    nextItems = { ...nextItems, ...autoCalculated };
                }

                setItemValues(nextItems);
            }
        }

    }, [taskValues, selectedEVCode, codes]); // Dependencies: updates when Tasks change


    if (!codes) return <div className="text-white p-8">Loading configuration...</div>;



    const handleEVCodeSelect = (code: string) => {
        setSelectedEVCode(code);
        setStep(2);
    };

    const handleSubmit = async () => {
        if (!selectedEVCode) return;

        // Auto-derive mCode
        const ev = codes?.evCodes.find(e => e.code === selectedEVCode);
        const derivedMCode = ev?.mCode || 'M01';

        const reportPayload = {
            mCode: derivedMCode,
            evCode: selectedEVCode,
            tasks: taskValues,
            items: itemValues
        };

        try {
            if (isEditMode && editId) {
                await updateReport(editId, reportPayload);
                alert('Report Updated Successfully!');
            } else {
                await submitReport(reportPayload);
                alert('Report Submitted Successfully!');
            }
            navigate('/history'); // Redirect to history usually makes sense after edit
        } catch (err) {
            alert('Failed to submit report');
        }
    };

    // --- RENDERERS ---

    // --- RENDERERS ---

    const renderStep1 = () => {
        const sortedEvents = [...codes.evCodes].sort((a, b) => (a.priority || 99) - (b.priority || 99));
        const highPriorityEvents = sortedEvents.filter(ev => (ev.priority || 99) <= 5);
        const lowPriorityEvents = sortedEvents.filter(ev => (ev.priority || 99) > 5);

        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-bold text-white">
                        {isEditMode ? 'Editing Event' : 'What is the event?'}
                    </h2>

                </div>

                {/* High Priority Section */}
                <div>
                    <h3 className="text-lg font-semibold text-primary-400 mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Anchor size={18} /> Frequent Events
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {highPriorityEvents.map((ev) => (
                            <SelectionCard
                                key={ev.code}
                                label={ev.name}
                                code={ev.code}
                                onClick={() => handleEVCodeSelect(ev.code)}
                                icon={<ShipIcon className="w-10 h-10 text-emerald-400" />}
                            />
                        ))}
                    </div>
                </div>

                {/* Low Priority Section */}
                {lowPriorityEvents.length > 0 && (
                    <div className="pt-8 border-t border-ocean-700">
                        <h3 className="text-lg font-semibold text-slate-500 mb-4 uppercase tracking-wider">Other Events</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {lowPriorityEvents.map((ev) => (
                                <SelectionCard
                                    key={ev.code}
                                    label={ev.name}
                                    code={ev.code}
                                    onClick={() => handleEVCodeSelect(ev.code)}
                                    icon={<ShipIcon className="w-8 h-8 text-slate-500 group-hover:text-primary-400 transition-colors" />}
                                    className="h-44" // Reduced by ~20% from h-56
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const EXPANDABLE_FUEL_RCODES = ['R030', 'R031', 'R056', 'R057', 'R058'];

    const renderStep2 = () => {
        const ev = codes?.evCodes.find(e => e.code === selectedEVCode);
        if (!ev || !codes) return <div>Invalid Event</div>;

        const mCodeName = codes.mCodes.find(m => m.code === ev.mCode)?.name || ev.mCode;

        // T-Codes: Priority Sorted
        const validTCodes = (ev.validTCodes || [])
            .map(tc => codes.tCodes.find(t => t.code === tc))
            .filter((t): t is TCode => !!t)
            .sort((a, b) => (a.priority || 99) - (b.priority || 99));

        // R-Codes: Grouped & Priority Sorted
        const validRCodes = (ev.validRCodes || [])
            .map(rc => codes.rCodes.find(r => r.code === rc))
            .filter((r): r is RCode => !!r);

        const rCodeGroups = validRCodes.reduce((acc, r) => {
            const group = r.group || 'Other';
            if (!acc[group]) acc[group] = [];
            acc[group].push(r);
            return acc;
        }, {} as Record<string, RCode[]>);

        // Sort Groups: Custom Order or Alphabetical
        const groupOrder = ['Common', 'Conditions', 'Weather', 'Cargo Operation', 'Cargo Monitoring', 'ETC', 'Consumable', 'Engine'];
        const sortedGroups = Object.keys(rCodeGroups).sort((a, b) => {
            const idxA = groupOrder.indexOf(a);
            const idxB = groupOrder.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        const getLastEventName = () => {
            if (!lastReport) return 'No previous report';
            const lastEv = codes.evCodes.find(e => e.code === lastReport.evCode);
            return lastEv ? lastEv.name : lastReport.evCode;
        };

        const getLastEventDate = () => {
            if (!lastReport) return '';

            // Try to find a valid T-code (timestamps) excluding T46
            if (lastReport.tasks) {
                const eventTime = Object.entries(lastReport.tasks)
                    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                    .find(([k, v]) => k.startsWith('T') && k !== 'T46' && v)?.[1];

                if (eventTime) {
                    const cleanStr = eventTime.includes('T') ? eventTime.replace('T', ' ') : eventTime;
                    if (cleanStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                        return cleanStr.substring(0, 16).replace(/-/g, '.');
                    }
                    return cleanStr;
                }
            }

            if (!lastReport.submittedAt) return '';
            // Fallback to submittedAt
            const subTime = new Date(lastReport.submittedAt).toLocaleString();
            // Try to format consistent if it matches locale string format or just return it
            const cleanStr = subTime.includes('T') ? subTime.replace('T', ' ') : subTime;
            if (cleanStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                return cleanStr.substring(0, 16).replace(/-/g, '.');
            }
            return subTime;
        }

        // Fuel Status Logic
        const fuelStatusRCodes = ['R030', 'R031', 'R056']; // ROB, Cons, Bunker
        const hasFuelStatus = validRCodes.some(r => fuelStatusRCodes.includes(r.code)) && activeShip?.fuels?.length;

        const renderItems = (items: RCode[]) => {
            return items.map(r => {
                // SPECIAL: Pair Today Eng.Mile (R073) and Today Slip (R081) to reduce width (1/2 size)
                // If this is R081 and R073 exists, skip (handled by R073)
                if (r.code === 'R081' && items.some(i => i.code === 'R073')) return null;

                if (r.code === 'R073') {
                    const slipItem = items.find(i => i.code === 'R081');
                    if (slipItem) {
                        return (
                            <div key="eng_slip_pair" className="grid grid-cols-2 gap-4">
                                {/* Left: Eng.Mile (R073) */}
                                <div className="space-y-1 group">
                                    <label className="block text-sm font-medium text-slate-300 group-hover:text-emerald-400 transition-colors truncate" title={r.name}>{r.name}</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="any"
                                            className="w-full bg-ocean-900 border border-ocean-600 rounded-lg pl-3 pr-8 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all hover:border-ocean-500 placeholder-slate-700 text-sm"
                                            value={itemValues[r.code] || ''}
                                            onChange={e => {
                                                const newValues = { ...itemValues, [r.code]: e.target.value };
                                                setItemValues(newValues);
                                            }}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                {/* Right: Slip (R081) */}
                                <div className="space-y-1 group">
                                    <label className="block text-sm font-medium text-slate-300 group-hover:text-emerald-400 transition-colors truncate" title={slipItem.name}>{slipItem.name}</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="any"
                                            className="w-full bg-ocean-900 border border-ocean-600 rounded-lg pl-3 pr-8 py-3 text-white focus:ring-0 outline-none transition-all placeholder-slate-700 cursor-not-allowed opacity-70 text-sm"
                                            value={itemValues[slipItem.code] || ''}
                                            readOnly={true}
                                            placeholder="0.00"
                                        />
                                        {slipItem.unit && (
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 pointer-events-none">
                                                {slipItem.unit}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }
                }

                // FILTER OUT Fuel Status Codes from here (Already rendered)
                // Exception: R031 is needed ONLY for the Equipment Breakdown Table
                if (['R030', 'R056'].includes(r.code)) return null;

                // SPECIAL HANDLING: R133 (Total Revo Counter) -> Single or Multiple
                if (r.code === 'R133') {
                    const meEq = activeShip?.equipment?.find(e => e.code === 'E01' && e.installed);
                    if (meEq && meEq.count > 1) {
                        return (
                            <div key={r.code} className="col-span-1 md:col-span-2 space-y-3 bg-ocean-900/20 p-4 rounded-xl border border-ocean-700/50">
                                <div className="flex items-center justify-between">
                                    <label className="block text-sm font-medium text-slate-300 group-hover:text-emerald-400 transition-colors uppercase tracking-wider">{r.name}</label>
                                    <label className="flex items-center gap-2 text-xs text-yellow-400 cursor-pointer bg-yellow-400/10 px-2 py-1 rounded border border-yellow-400/20 hover:bg-yellow-400/20 transition-colors select-none">
                                        <input
                                            type="checkbox"
                                            checked={isOneEngineOp}
                                            onChange={e => setIsOneEngineOp(e.target.checked)}
                                            className="w-3.5 h-3.5 rounded text-yellow-500 focus:ring-yellow-500 bg-ocean-900 border-slate-600"
                                        />
                                        One Engine Operation (Sum)
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    {Array.from({ length: meEq.count }).map((_, i) => {
                                        const unit = i + 1;
                                        const fieldKey = `${r.code}_${unit}`;
                                        return (
                                            <div key={fieldKey} className="space-y-1">
                                                <label className="text-xs text-slate-500 font-mono">M/E #{unit}</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        className="w-full bg-ocean-900 border border-ocean-600 rounded-lg pl-3 pr-10 py-2.5 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all hover:border-ocean-500 placeholder-slate-700 text-sm"
                                                        value={itemValues[fieldKey] || ''}
                                                        onChange={e => setItemValues(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                                                        placeholder="0.00"
                                                    />
                                                    {r.unit && (
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none">
                                                            {r.unit}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    }
                }

                // WATER FILTER (Based on Ship Config)
                const WATER_CODE_MAP: Record<string, string> = {
                    'R127': 'W01', 'R123': 'W01', 'R032': 'W01', 'R033': 'W01', 'R138': 'W01',
                    'R158': 'W02', 'R157': 'W02', 'R159': 'W02',
                    'R129': 'W03', 'R128': 'W03', 'R130': 'W03'
                };
                const requiredWCode = WATER_CODE_MAP[r.code];
                if (requiredWCode) {
                    const hasWater = activeShip?.waters?.some(w => w.code === requiredWCode);
                    if (!hasWater) return null;
                }

                // 1. Define Mapping for Running Hours & Stop & Power
                const RH_MAP: Record<string, string[]> = {
                    'R067': ['E01'], // ME R/H -> M/E
                    'R078': ['E01'], // M/E Power
                    'R070': ['E01'], // Stop.Eng -> M/E
                    'R133': ['E01'], // Total Rev -> M/E
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

                // 2. Define Display Names for Equipment
                const EQ_NAMES: Record<string, string> = {
                    'E01': 'M/E',
                    'E02': 'M/BLR',
                    'E03': 'D/G',
                    'E04': 'T/G',
                    'E05': 'A/BLR',
                    'E06': 'IGG',
                    'E08': 'GCU',
                };

                // SPECIAL HANDLING: Running Hours & Stop Expansion
                const mappedECodes = RH_MAP[r.code];
                if (mappedECodes && activeShip?.equipment?.length) {
                    const matchingEq = activeShip.equipment.filter(eq => mappedECodes.includes(eq.code) && eq.installed);

                    if (matchingEq.length > 0) {
                        return matchingEq.map(eq => {
                            return Array.from({ length: eq.count }).map((_, idx) => {
                                const unitNum = idx + 1;
                                const fieldKey = `RH_${r.code}_${eq.code}_${unitNum}`;
                                return (
                                    <div key={fieldKey} className="space-y-1 group">
                                        <label className="block text-sm font-medium text-slate-300 group-hover:text-emerald-400 transition-colors">
                                            {EQ_NAMES[eq.code] || eq.code} No.{unitNum} {r.name}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="any"
                                                className="w-full bg-ocean-900 border border-ocean-600 rounded-lg pl-4 pr-16 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all hover:border-ocean-500 placeholder-slate-700"
                                                value={itemValues[fieldKey] || ''}
                                                onChange={e => setItemValues({ ...itemValues, [fieldKey]: e.target.value })}
                                                placeholder="0.00"
                                            />
                                            {r.unit && (
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none bg-ocean-900/50 pl-2">
                                                    {r.unit}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            });
                        });
                    }
                }

                // 3. Define Mapping for Tank Expansion
                const TANK_MAP: Record<string, 'cargo' | 'ballast'> = {
                    'R091': 'cargo',    // Cargo Tank Temp
                    'R098': 'cargo',    // Tank Pressure
                    'R151': 'cargo',    // Tank Pressure (LNG)
                    'R053': 'ballast',  // Ballast Qty
                };

                // SPECIAL HANDLING: Cargo/Ballast Tank Expansion
                const tankType = TANK_MAP[r.code];
                if (tankType) {
                    const count = activeShip?.tankCounts?.[tankType] || 0;
                    if (count > 0) {
                        return Array.from({ length: count }).map((_, idx) => {
                            const unitNum = idx + 1;
                            const fieldKey = `TANK_${r.code}_${tankType}_${unitNum}`;
                            const label = `${r.name} - ${tankType === 'cargo' ? 'Cargo' : 'Ballast'} Tank No.${unitNum}`;

                            return (
                                <div key={fieldKey} className="space-y-1 group">
                                    <label className="block text-sm font-medium text-slate-300 group-hover:text-emerald-400 transition-colors">
                                        {label}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="any"
                                            className="w-full bg-ocean-900 border border-ocean-600 rounded-lg pl-4 pr-16 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all hover:border-ocean-500 placeholder-slate-700"
                                            value={itemValues[fieldKey] || ''}
                                            onChange={e => setItemValues({ ...itemValues, [fieldKey]: e.target.value })}
                                            placeholder="0.00"
                                        />
                                        {r.unit && (
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none bg-ocean-900/50 pl-2">
                                                {r.unit}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        });
                    }
                }

                // SPECIAL HANDLING: R031 Consumption (Per Equipment) -> TABLE LAYOUT
                if (r.code === 'R031') {
                    if (activeShip?.equipment?.length) {
                        // 1. Identify relevant equipment
                        const relevantEquipment = activeShip.equipment
                            .filter(eq => eq.installed)
                            .map(eq => ({
                                ...eq,
                                fuelsToRender: eq.validFuels || []
                            }))
                            .filter(eq => eq.fuelsToRender.length > 0);

                        if (relevantEquipment.length > 0) {
                            // Get Unique Fuels for Columns
                            const allFuels = Array.from(new Set(relevantEquipment.flatMap(e => e.fuelsToRender)));

                            return (
                                <div key="R031_Breakdown" className="col-span-full mb-6 overflow-hidden rounded-xl border border-ocean-700 bg-ocean-900/30">
                                    <div className="p-4 bg-ocean-900/50 border-b border-ocean-700 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary-400"></div>
                                        <h4 className="text-sm font-bold text-primary-400 uppercase tracking-wider">
                                            Equipment Fuel Breakdown
                                        </h4>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs text-slate-400 uppercase bg-ocean-900/80">
                                                <tr>
                                                    <th className="px-6 py-3 font-medium">Equipment</th>
                                                    {allFuels.map(fCode => (
                                                        <th key={fCode} className="px-6 py-3 font-medium text-emerald-400">
                                                            {codes?.fCodes?.find(f => f.code === fCode)?.name || fCode}
                                                            <span className="text-[10px] text-slate-600 ml-1 block normal-case">{r.unit}</span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-ocean-800">
                                                {relevantEquipment.flatMap(eq =>
                                                    Array.from({ length: eq.count }).map((_, idx) => {
                                                        const unitNum = idx + 1;
                                                        return (
                                                            <tr key={`${eq.code}_${unitNum}`} className="hover:bg-ocean-800/50 transition-colors group">
                                                                <td className="px-6 py-4 font-medium text-slate-300">
                                                                    {EQ_NAMES[eq.code] || eq.code} <span className="text-slate-500">#{unitNum}</span>
                                                                </td>
                                                                {allFuels.map(fCode => {
                                                                    // Check if this fuel is valid for this equipment
                                                                    const isValid = eq.fuelsToRender.includes(fCode);
                                                                    const fieldKey = `CONS_${eq.code}_${unitNum}_${fCode}`;

                                                                    if (!isValid) return <td key={fCode} className="px-6 py-4 bg-ocean-950/30"></td>;

                                                                    return (
                                                                        <td key={fCode} className="px-6 py-3">
                                                                            <input
                                                                                type="number"
                                                                                step="any"
                                                                                className="w-full bg-ocean-900 border border-ocean-700 rounded px-3 py-2 text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-right font-mono text-sm hover:border-ocean-600 transition-all placeholder-slate-700"
                                                                                value={itemValues[fieldKey] || ''}
                                                                                onChange={e => setItemValues({ ...itemValues, [fieldKey]: e.target.value })}
                                                                                placeholder="0.00"
                                                                            />
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        )
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        }
                    }
                    // Skip Total Input rendering for R031 here as it is done in Fuel Status
                    return null;
                }

                if (EXPANDABLE_FUEL_RCODES.includes(r.code) && activeShip?.fuels?.length) {
                    const isEquipmentMode = activeShip?.equipment && activeShip.equipment.length > 0;
                    // Skip R030, R031(handled above), R056 if they are in this list
                    // Skip R030, R056 (Always in Fuel Status)
                    if (['R030', 'R056'].includes(r.code)) return null;
                    // Skip R031 ONLY if in Equipment Mode (Handled by Breakdown Table)
                    if (r.code === 'R031' && isEquipmentMode) return null;

                    return activeShip.fuels.map(fuel => {
                        const fCode = fuel.code;
                        const fData = codes?.fCodes?.find(f => f.code === fCode);
                        const fieldKey = `${r.code}_${fCode}`;
                        const isReadOnly = r.code === 'R030' || (r.code === 'R031' && isEquipmentMode);

                        return (
                            <div key={fieldKey} className="space-y-1 group">
                                <label className="block text-sm font-medium text-slate-300 group-hover:text-emerald-400 transition-colors">
                                    {r.name} - {fData?.name || fCode} {isReadOnly && r.code === 'R031' ? '(Total)' : ''}
                                </label>
                                <div className="relative">
                                    <input
                                        type={r.type === 'number' ? 'number' : 'text'}
                                        step="any"
                                        className={`w-full bg-ocean-900 border border-ocean-600 rounded-lg pl-4 pr-16 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all hover:border-ocean-500 placeholder-slate-700 ${isReadOnly ? 'opacity-70 cursor-not-allowed bg-ocean-950' : ''}`}
                                        value={itemValues[fieldKey] || ''}
                                        onChange={e => setItemValues({ ...itemValues, [fieldKey]: e.target.value })}
                                        placeholder={isReadOnly ? 'Auto-calc' : '0.00'}
                                        readOnly={isReadOnly as boolean}
                                    />
                                    {r.unit && (
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none bg-ocean-900/50 pl-2">
                                            {r.unit}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    });
                }

                // Special Render: Voyage Number (R005) - Mask "NNN-L"
                if (r.code === 'R005') {
                    return (
                        <div key={r.code} className="space-y-1 group">
                            <label className="block text-sm font-medium text-slate-300 group-hover:text-emerald-400 transition-colors uppercase tracking-wider">{r.name}</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    className="w-full bg-ocean-900 border border-ocean-600 rounded-lg pl-4 pr-16 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all hover:border-ocean-500 placeholder-slate-700 font-mono tracking-wider"
                                    placeholder="000-A"
                                    maxLength={5}
                                    value={itemValues[r.code] || ''}
                                    onChange={e => {
                                        let val = e.target.value.toUpperCase();
                                        const clean = val.replace(/[^0-9A-Z]/g, '');

                                        let formatted = '';
                                        // Part 1: First 3 chars (Digits)
                                        const part1 = clean.substring(0, 3).replace(/[^0-9]/g, '');
                                        formatted = part1;

                                        // Part 2: Hyphen + Letter
                                        if (part1.length === 3 && clean.length > 3) {
                                            const part2 = clean.substring(3, 4).replace(/[^A-Z]/g, '');
                                            if (part2) formatted += `-${part2}`;
                                        }

                                        setItemValues({ ...itemValues, [r.code]: formatted });
                                    }}
                                />
                                {r.unit && (
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none bg-ocean-900/50 pl-2">
                                        {r.unit}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                }

                // Special handling for R006 (Location)
                if (r.code === 'R006') {
                    const currentVal = String(itemValues['R006'] || '');
                    const [latStr, longStr] = currentVal.includes(' / ') ? currentVal.split(' / ') : [currentVal, ''];

                    // Helper to parse "DD-MM.M D" -> {deg, min, dir}
                    const parsePos = (val: string) => {
                        // Expected format somewhat loosely: "35-05.0 N"
                        // But handle partials carefully
                        if (!val) return { deg: '', min: '', dir: '' };
                        const parts = val.trim().split(' ');
                        const dir = parts.length > 1 ? parts[parts.length - 1] : '';
                        const numberPart = parts[0] || '';
                        const [deg, min] = numberPart.includes('-') ? numberPart.split('-') : [numberPart, ''];
                        return { deg, min, dir };
                    };

                    const lat = parsePos(latStr);
                    const long = parsePos(longStr);

                    const updateLat = (p: { deg?: string, min?: string, dir?: string }) => {
                        const newDeg = p.deg !== undefined ? p.deg : lat.deg;
                        const newMin = p.min !== undefined ? p.min : lat.min;
                        const newDir = p.dir !== undefined ? p.dir : (lat.dir || 'N');

                        // Construct string "DD-MM.M D"
                        const newLatStr = `${newDeg || '0'}-${newMin || '00.0'} ${newDir}`;
                        const newR006 = `${newLatStr} / ${longStr || '0-00.0 E'}`;
                        setItemValues({ ...itemValues, 'R006': newR006 });
                    };

                    const updateLong = (p: { deg?: string, min?: string, dir?: string }) => {
                        const newDeg = p.deg !== undefined ? p.deg : long.deg;
                        const newMin = p.min !== undefined ? p.min : long.min;
                        const newDir = p.dir !== undefined ? p.dir : (long.dir || 'E');

                        const newLongStr = `${newDeg || '0'}-${newMin || '00.0'} ${newDir}`;
                        const newR006 = `${latStr || '0-00.0 N'} / ${newLongStr}`;
                        setItemValues({ ...itemValues, 'R006': newR006 });
                    };

                    return (
                        <div key={r.code} className="space-y-2 group col-span-1 md:col-span-2 lg:col-span-4 bg-ocean-900/20 p-4 rounded-xl border border-ocean-700/50">
                            <label className="block text-sm font-medium text-slate-300 group-hover:text-emerald-400 transition-colors uppercase tracking-wider">{r.name}</label>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Latitude Row */}
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-mono text-slate-500 w-8 font-bold">LAT</span>
                                    <div className="flex-1 flex gap-2">
                                        <div className="relative flex-[2]">
                                            <input
                                                type="number"
                                                className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none text-right pr-8"
                                                value={lat.deg}
                                                onChange={e => updateLat({ deg: e.target.value })}
                                                placeholder="Deg"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">°</span>
                                        </div>
                                        <div className="relative flex-[1.5]">
                                            <input
                                                type="text"
                                                className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none text-right pr-8"
                                                value={lat.min}
                                                onChange={e => updateLat({ min: e.target.value })}
                                                placeholder="Min"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">'</span>
                                        </div>
                                        <select
                                            className="w-16 bg-ocean-900 border border-ocean-600 rounded-lg px-2 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none text-center font-mono"
                                            value={lat.dir}
                                            onChange={e => updateLat({ dir: e.target.value })}
                                        >
                                            <option value="">-</option>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Longitude Row */}
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-mono text-slate-500 w-8 font-bold">LONG</span>
                                    <div className="flex-1 flex gap-2">
                                        <div className="relative flex-[2]">
                                            <input
                                                type="number"
                                                className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none text-right pr-8"
                                                value={long.deg}
                                                onChange={e => updateLong({ deg: e.target.value })}
                                                placeholder="Deg"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">°</span>
                                        </div>
                                        <div className="relative flex-[1.5]">
                                            <input
                                                type="text"
                                                className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none text-right pr-8"
                                                value={long.min}
                                                onChange={e => updateLong({ min: e.target.value })}
                                                placeholder="Min"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">'</span>
                                        </div>
                                        <select
                                            className="w-16 bg-ocean-900 border border-ocean-600 rounded-lg px-2 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none text-center font-mono"
                                            value={long.dir}
                                            onChange={e => updateLong({ dir: e.target.value })}
                                        >
                                            <option value="">-</option>
                                            <option value="E">E</option>
                                            <option value="W">W</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                }

                // NORMAL RENDER for other groups
                const isReadOnly = ['R200', 'R081'].includes(r.code);

                return (
                    <div key={r.code} className="space-y-1 group">
                        <label className="block text-sm font-medium text-slate-300 group-hover:text-emerald-400 transition-colors">{r.name}</label>
                        <div className="relative">
                            <input
                                type={r.type === 'number' ? 'number' : 'text'}
                                step="any"
                                className={`w-full bg-ocean-900 border border-ocean-600 rounded-lg pl-4 pr-16 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all hover:border-ocean-500 placeholder-slate-700 ${isReadOnly ? 'opacity-50 cursor-not-allowed bg-ocean-950 focus:ring-0 hover:border-ocean-600' : ''}`}
                                value={itemValues[r.code] || ''}
                                onChange={e => {
                                    if (isReadOnly) return;
                                    const newVal = e.target.value;
                                    let newValues = { ...itemValues, [r.code]: newVal };

                                    // Auto-Calculation Logic (Shared Helper)
                                    const autoCalcValues = calculateTimeUpdates(itemValues, r.code, newVal);
                                    if (autoCalcValues) {
                                        newValues = autoCalcValues;
                                    }

                                    setItemValues(newValues);
                                }}
                                placeholder={r.type === 'number' ? '0.00' : ''}
                                readOnly={isReadOnly}
                            />
                            {r.unit && (
                                <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none bg-ocean-900/50 pl-2 transition-opacity duration-200 ${itemValues[r.code] ? 'opacity-0' : 'opacity-100'}`}>
                                    {r.unit}
                                </span>
                            )}
                        </div>
                    </div>
                );

            });
        };

        return (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                <div className="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur-sm shadow-xl border-b border-ocean-700 pb-4 pt-4 -mt-4 px-4 -mx-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-primary-400 text-sm font-semibold uppercase tracking-wider mb-1">
                                <span>{mCodeName}</span>
                                <ChevronRight size={14} />
                                <span>{ev.name}</span>
                            </div>
                            <h2 className="text-3xl font-bold text-white">Event Details</h2>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => setStep(1)} className="text-slate-400 hover:text-white text-sm hover:underline">Change Event</button>
                            <button
                                onClick={handleSubmit}
                                className="bg-primary-500 hover:bg-primary-400 text-white px-6 py-2 rounded-xl font-bold text-lg shadow-xl shadow-primary-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
                            >
                                <CheckCircle size={20} /> {isEditMode ? 'Update Report' : 'Submit'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* TASKS SECTION */}
                {validTCodes.length > 0 && (
                    <CollapsibleSection
                        title="Time & Tasks"
                        icon={<Clock className="text-primary-400" />}
                        isOpen={!collapsedSections['tasks']}
                        onToggle={() => toggleSection('tasks')}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {validTCodes.map(t => {
                                if (t.code === 'T46') {
                                    return (
                                        <div key={t.code} className="space-y-1 col-span-1 md:col-span-2 lg:col-span-1 bg-ocean-900/50 p-4 rounded-xl border border-primary-500/30">
                                            <div className="flex items-center gap-2 text-primary-400 mb-2">
                                                <History size={16} />
                                                <span className="text-xs font-bold uppercase tracking-wider border border-primary-500/50 px-2 py-0.5 rounded">Last Event Report</span>
                                            </div>
                                            <div className="text-white font-medium text-lg">
                                                {getLastEventName()}
                                            </div>
                                            <div className="text-slate-400 text-sm">
                                                {getLastEventDate()}
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                    <div key={t.code} className="space-y-1">
                                        <label className="block text-sm font-medium text-slate-400 mb-1">{t.name}</label>
                                        <DateTimeInput
                                            value={taskValues[t.code] || (['EV05', 'EV06'].includes(ev.code) && t.name.toLowerCase().includes('noon') ? `${new Date().toISOString().split('T')[0]} 12:00` : '')}
                                            onChange={e => {
                                                let val = e.target.value;
                                                // Lock time to 12:00 for Noon Reports (EV05, EV06) AND only for Noon related tasks
                                                if (['EV05', 'EV06'].includes(ev.code) && t.name.toLowerCase().includes('noon') && val) {
                                                    const datePart = val.replace('T', ' ').split(' ')[0] || val;
                                                    val = `${datePart} 12:00`;
                                                }
                                                setTaskValues({ ...taskValues, [t.code]: val });
                                            }}
                                        // Optional: Pass a prop if DateTimeInput supports disabling time
                                        />
                                        <p className="text-xs text-slate-500 mt-1">{t.description} {['EV05', 'EV06'].includes(ev.code) && t.name.toLowerCase().includes('noon') && <span className="text-amber-500">(Fixed to 12:00)</span>}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </CollapsibleSection>
                )}

                {/* ITEMS SECTION */}
                {sortedGroups.map(group => {
                    const groupItems = rCodeGroups[group]
                        .sort((a, b) => (a.priority || 99) - (b.priority || 99));

                    // SPLIT LOGIC FOR CONSUMABLE
                    if (group === 'Consumable') {
                        // 1. Fuel Consumable: R031 (Cons)
                        // Note: R030, R056 are skipped here as they are in Fuel Status.
                        const fuelConsumableItems = groupItems.filter(r => ['R031'].includes(r.code));

                        // 2. L.O & Water: Everything else (R035-R050, R057, R058 etc.)
                        // Excluding R030, R056 (Status) and R031 (Fuel Cons)
                        // Also exclude Water/LO Table codes to avoid duplication:
                        // Water: R127(ROB), R123(Cons), R033(Prod), R158(ROB), R157(Cons), R159(Sup), R129(ROB), R128(Cons), R130(Sup)
                        // LO: R126(ROB), R124(Cons), R122(Sup)
                        const STATUS_TABLE_CODES = [
                            'R127', 'R123', 'R033', // FW
                            'R158', 'R157', 'R159', // DW
                            'R129', 'R128', 'R130', // BW
                            'R126', 'R124', 'R122'  // LO
                        ];
                        const loWaterItems = groupItems.filter(r =>
                            !['R030', 'R056', 'R031'].includes(r.code) &&
                            !STATUS_TABLE_CODES.includes(r.code)
                        );

                        return (
                            <React.Fragment key={group}>
                                {/* 1. Fuel Consumable Section */}
                                {fuelConsumableItems.length > 0 && (
                                    <CollapsibleSection
                                        title="Fuel Consumable"
                                        icon={<div className="w-3 h-3 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.5)]"></div>}
                                        isOpen={!collapsedSections['fuelConsumable']}
                                        onToggle={() => toggleSection('fuelConsumable')}
                                    >
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                            {renderItems(fuelConsumableItems)}
                                        </div>
                                    </CollapsibleSection>
                                )}

                                {/* 2. Fuel Status Section (MOVED HERE) */}
                                {hasFuelStatus && (
                                    <CollapsibleSection
                                        title="Fuel Status (Auto-Calculated)"
                                        icon={<ShipIcon className="text-amber-400" />}
                                        isOpen={!collapsedSections['fuelStatus']}
                                        onToggle={() => toggleSection('fuelStatus')}
                                    >
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-slate-400 uppercase bg-ocean-900/80">
                                                    <tr>
                                                        <th className="px-6 py-3 font-medium">Fuel Type</th>
                                                        <th className="px-6 py-3 font-medium text-slate-300">Last Event ROB</th>
                                                        <th className="px-6 py-3 font-medium text-amber-400">Today Bunkered (+)</th>
                                                        <th className="px-6 py-3 font-medium text-red-400">Today Consumed (-)</th>
                                                        <th className="px-6 py-3 font-medium text-emerald-400">Current ROB (=)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-ocean-800">
                                                    {activeShip!.fuels!.map(fuel => {
                                                        const fCode = fuel.code;
                                                        const fName = codes?.fCodes?.find(f => f.code === fCode)?.name || fCode;

                                                        // Keys
                                                        const robKey = `R030_${fCode}`;
                                                        const consKey = `R031_${fCode}`;
                                                        const bunkerKey = `R056_${fCode}`;

                                                        // Get Previous ROB
                                                        let prevRob = 0;
                                                        if (lastReport && lastReport.items?.[robKey]) {
                                                            prevRob = parseFloat(lastReport.items[robKey] as string);
                                                        } else {
                                                            prevRob = fuel.initialRob || 0;
                                                        }

                                                        return (
                                                            <tr key={fCode} className="hover:bg-ocean-800/30 transition-colors">
                                                                <td className="px-6 py-4 font-bold text-white">{fName}</td>
                                                                <td className="px-6 py-4 font-mono text-slate-300">{prevRob.toFixed(2)}</td>
                                                                <td className="px-6 py-4">
                                                                    <input
                                                                        type="number"
                                                                        step="any"
                                                                        className="w-32 bg-ocean-900 border border-ocean-700 rounded px-3 py-2 text-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none text-right font-mono text-sm hover:border-ocean-600 transition-all placeholder-slate-700"
                                                                        value={itemValues[bunkerKey] || ''}
                                                                        onChange={e => setItemValues({ ...itemValues, [bunkerKey]: e.target.value })}
                                                                        placeholder="0.00"
                                                                    />
                                                                </td>
                                                                <td className="px-6 py-4 font-mono text-white">
                                                                    <div className="bg-ocean-900/50 px-3 py-2 rounded border border-ocean-800 text-right w-32">
                                                                        {itemValues[consKey] || '0.00'}
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="bg-emerald-500/10 px-3 py-2 rounded border border-emerald-500/30 text-emerald-400 font-bold text-right w-32 font-mono">
                                                                        {itemValues[robKey] || prevRob.toFixed(2)}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CollapsibleSection>
                                )}

                                {/* 3. L.O & Water Consumable Section (Generic Items) */}
                                {loWaterItems.length > 0 && (
                                    <CollapsibleSection
                                        title="L.O & Water Consumable"
                                        icon={<div className="w-3 h-3 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]"></div>}
                                        isOpen={!collapsedSections['loWaterConsumable']}
                                        onToggle={() => toggleSection('loWaterConsumable')}
                                    >
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                            {renderItems(loWaterItems)}
                                        </div>
                                    </CollapsibleSection>
                                )}

                                {/* 4. L.O & Water Status (Auto-Calculated) - SEPARATE SECTION */}
                                {(activeShip?.waters?.length || activeShip?.lubeOils?.length) ? (
                                    <CollapsibleSection
                                        title="L.O & Water Consumable"
                                        icon={<div className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"></div>}
                                        isOpen={!collapsedSections['loWaterStatus']}
                                        onToggle={() => toggleSection('loWaterStatus')}
                                    >
                                        <div className="overflow-x-auto rounded-xl border border-ocean-700 bg-ocean-900/30">
                                            <div className="p-4 bg-ocean-900/50 border-b border-ocean-700 flex items-center gap-2">
                                                <ShipIcon size={16} className="text-secondary-400" />
                                                <h4 className="text-sm font-bold text-secondary-400 uppercase tracking-wider">
                                                    L.O & Water Consumable
                                                </h4>
                                            </div>
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-slate-400 uppercase bg-ocean-900/80">
                                                    <tr>
                                                        <th className="px-6 py-3 font-medium">Type</th>
                                                        <th className="px-6 py-3 font-medium text-slate-300">Last Event ROB</th>
                                                        <th className="px-6 py-3 font-medium text-amber-400">production or Ashore Supply</th>
                                                        <th className="px-6 py-3 font-medium text-red-400">Consumed (-)</th>
                                                        <th className="px-6 py-3 font-medium text-emerald-400">Current ROB (=)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-ocean-800">
                                                    {/* WATER ROWS */}
                                                    {activeShip?.waters?.map(water => {
                                                        const mapData: any = {
                                                            'W01': { rob: 'R127', cons: 'R123', add: 'R033' }, // FW: ROB=R127, Cons=R123, Add=R033(Prod)
                                                            'W02': { rob: 'R158', cons: 'R157', add: 'R159' }, // DW: ROB=R158, Cons=R157, Add=R159(Sup)
                                                            'W03': { rob: 'R129', cons: 'R128', add: 'R130' }  // BW: ROB=R129, Cons=R128, Add=R130(Sup)
                                                        };
                                                        const wMap = mapData[water.code];
                                                        if (!wMap) return null;

                                                        const wName = codes?.wCodes?.find(w => w.code === water.code)?.name || water.code;

                                                        // Values
                                                        let prevRob = 0;
                                                        if (lastReport && lastReport.items?.[wMap.rob]) {
                                                            prevRob = parseFloat(lastReport.items[wMap.rob] as string);
                                                        } else {
                                                            prevRob = water.initialRob || 0;
                                                        }

                                                        return (
                                                            <tr key={water.code} className="hover:bg-ocean-800/30 transition-colors">
                                                                <td className="px-6 py-4 font-bold text-white">{wName}</td>
                                                                <td className="px-6 py-4 font-mono text-slate-300">{prevRob.toFixed(2)}</td>
                                                                <td className="px-6 py-4">
                                                                    <input
                                                                        type="number"
                                                                        step="any"
                                                                        className="w-32 bg-ocean-900 border border-ocean-700 rounded px-3 py-2 text-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none text-right font-mono text-sm hover:border-ocean-600 transition-all placeholder-slate-700"
                                                                        value={itemValues[wMap.add] || ''}
                                                                        onChange={e => setItemValues({ ...itemValues, [wMap.add]: e.target.value })}
                                                                        placeholder="0.00"
                                                                    />
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <input
                                                                        type="number"
                                                                        step="any"
                                                                        className="w-32 bg-ocean-900 border border-ocean-700 rounded px-3 py-2 text-white focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none text-right font-mono text-sm hover:border-ocean-600 transition-all placeholder-slate-700"
                                                                        value={itemValues[wMap.cons] || ''}
                                                                        onChange={e => setItemValues({ ...itemValues, [wMap.cons]: e.target.value })}
                                                                        placeholder="0.00"
                                                                    />
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="bg-emerald-500/10 px-3 py-2 rounded border border-emerald-500/30 text-emerald-400 font-bold text-right w-32 font-mono">
                                                                        {itemValues[wMap.rob] || prevRob.toFixed(2)}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}

                                                    {/* LO ROWS */}
                                                    {activeShip?.lubeOils?.map(lo => {
                                                        const lCode = lo.code;
                                                        const lName = codes?.lCodes?.find(l => l.code === lCode)?.name || lCode;

                                                        // Keys
                                                        const robKey = `R126_${lCode}`;
                                                        const consKey = `R124_${lCode}`;
                                                        const supKey = `R122_${lCode}`;

                                                        // Get Previous ROB
                                                        let prevRob = 0;
                                                        if (lastReport && lastReport.items?.[robKey]) {
                                                            prevRob = parseFloat(lastReport.items[robKey] as string);
                                                        } else {
                                                            prevRob = lo.initialRob || 0;
                                                        }

                                                        return (
                                                            <tr key={lCode} className="hover:bg-ocean-800/30 transition-colors">
                                                                <td className="px-6 py-4 font-bold text-white">{lName}</td>
                                                                <td className="px-6 py-4 font-mono text-slate-300">{prevRob.toFixed(2)}</td>
                                                                <td className="px-6 py-4">
                                                                    <input
                                                                        type="number"
                                                                        step="any"
                                                                        className="w-32 bg-ocean-900 border border-ocean-700 rounded px-3 py-2 text-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none text-right font-mono text-sm hover:border-ocean-600 transition-all placeholder-slate-700"
                                                                        value={itemValues[supKey] || ''}
                                                                        onChange={e => setItemValues({ ...itemValues, [supKey]: e.target.value })}
                                                                        placeholder="0.00"
                                                                    />
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <input
                                                                        type="number"
                                                                        step="any"
                                                                        className="w-32 bg-ocean-900 border border-ocean-700 rounded px-3 py-2 text-white focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none text-right font-mono text-sm hover:border-ocean-600 transition-all placeholder-slate-700"
                                                                        value={itemValues[consKey] || ''}
                                                                        onChange={e => setItemValues({ ...itemValues, [consKey]: e.target.value })}
                                                                        placeholder="0.00"
                                                                    />
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="bg-emerald-500/10 px-3 py-2 rounded border border-emerald-500/30 text-emerald-400 font-bold text-right w-32 font-mono">
                                                                        {itemValues[robKey] || prevRob.toFixed(2)}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CollapsibleSection>
                                ) : null}
                            </React.Fragment>
                        );
                    }

                    // NORMAL RENDER for other groups
                    return (
                        <CollapsibleSection
                            key={group}
                            title={group}
                            isOpen={!collapsedSections[group]}
                            onToggle={() => toggleSection(group)}
                            icon={<div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>}
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                {renderItems(groupItems)}
                            </div>
                        </CollapsibleSection>
                    );
                })}

                {validTCodes.length === 0 && validRCodes.length === 0 && (
                    <div className="text-center py-20 text-slate-500 bg-ocean-800/50 rounded-2xl border border-dashed border-ocean-700">
                        <p className="text-xl">No configurations found for this event.</p>
                        <p className="text-sm mt-2">Please configure T-Codes and R-Codes in Settings.</p>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header with Ship Selection */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
                <div>
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-500">
                        New Event Report
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">
                        {isEditMode ? 'Modify existing operational event record' : 'Record a new operational event'}
                    </p>
                </div>

                {/* Ship Selector */}
                <div className="flex items-center gap-3 bg-ocean-800/50 p-3 rounded-xl border border-ocean-700 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-emerald-400 font-medium px-2">
                        <ShipIcon size={20} />
                        <span className="text-sm uppercase tracking-wider">Vessel</span>
                    </div>
                    <div className="relative">
                        <select
                            value={activeShip?.name || ''}
                            onChange={handleShipChange}
                            className="appearance-none bg-ocean-900 border border-ocean-600 text-white pl-4 pr-10 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none min-w-[200px] font-medium transition-all hover:border-ocean-500 cursor-pointer"
                        >
                            {ships.map(ship => (
                                <option key={ship.name} value={ship.name}>
                                    {ship.name}
                                </option>
                            ))}
                        </select>
                        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" size={16} />
                    </div>
                </div>
            </div>

            {/* Step Content */}
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
        </div>
    );
};

const SelectionCard = ({ label, code, onClick, icon, className }: { label: string; code: string; onClick: () => void; icon: React.ReactNode; className?: string }) => (
    <div
        onClick={onClick}
        className={cn(
            "group bg-ocean-800 hover:bg-ocean-700 border border-ocean-700 hover:border-primary-500/50 p-8 rounded-2xl cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-primary-500/10 flex flex-col items-center justify-center text-center gap-4 h-64",
            className
        )}
    >
        <div className="p-4 bg-ocean-900 rounded-full group-hover:scale-110 transition-transform duration-300 border border-ocean-700 group-hover:border-primary-500/20">
            {icon}
        </div>
        <div>
            <h3 className="text-xl font-bold text-white group-hover:text-primary-400 transition-colors">{label}</h3>
            <p className="text-sm text-slate-500 mt-1 font-mono">{code}</p>
        </div>
    </div>
);

const CollapsibleSection = ({
    title,
    icon,
    isOpen,
    onToggle,
    children,
    className
}: {
    title: string;
    icon?: React.ReactNode;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    className?: string;
}) => (
    <div className={cn("bg-ocean-800 rounded-2xl border border-ocean-700 overflow-hidden transition-all duration-300", className)}>
        <button
            onClick={onToggle}
            className="w-full flex items-center justify-between p-6 hover:bg-ocean-700/50 transition-colors"
        >
            <h3 className="text-xl font-bold text-white flex items-center gap-3">
                {icon}
                <span>{title}</span>
            </h3>
            <div className={cn("text-slate-400 transition-transform duration-300", isOpen ? "rotate-180" : "")}>
                <ChevronDown size={24} />
            </div>
        </button>
        {isOpen && (
            <div className="border-t border-ocean-700/50 p-6 animate-in slide-in-from-top-2 duration-200">
                {children}
            </div>
        )}
    </div>
);

export default NewReport;
