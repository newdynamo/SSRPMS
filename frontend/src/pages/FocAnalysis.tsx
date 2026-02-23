import { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, Ship as ShipIcon, Droplet, Zap, AlertCircle, History, Map as MapIcon, Fuel, Calendar, ArrowUp, ArrowDown, Printer } from 'lucide-react';
import { fetchShips } from '../api/ships';
import { fetchReports, updateReport } from '../api/reports';
import { fetchCodes } from '../api/codes';
import type { Ship, Report, CodeData } from '../types/index';
import { cn } from '../utils/cn';
import {
    ComposedChart,
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart, Pie, Cell, Legend, ReferenceDot, Scatter
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    // Check for Noon Report (Scatter) - Check by date OR by known name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noonReport = payload.find((p: any) => p.payload.date || p.name === 'Voyage Noon Reports');

    if (noonReport) {
        const data = noonReport.payload;
        return (
            <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl text-slate-200 text-sm z-50 min-w-[200px]">
                <div className="font-bold text-amber-400 mb-3 pb-2 border-b border-slate-700/50 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                        {data.name || 'Voyage Data'}
                    </div>
                    {data.eventType && <span className="text-xs text-slate-400 font-normal pl-4">{data.eventType}</span>}
                </div>
                <div className="space-y-2">
                    {data.location && (
                        <div className="flex justify-between items-start gap-4 pb-2 border-b border-slate-700/30 mb-2">
                            <span className="text-slate-400 text-xs uppercase tracking-wider font-medium">Location</span>
                            <span className="font-mono text-white text-right max-w-[150px] truncate" title={data.location}>{data.location}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-slate-400 text-xs uppercase tracking-wider font-medium">Date</span>
                        <span className="font-mono text-white">{data.date || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-slate-400 text-xs uppercase tracking-wider font-medium">Speed</span>
                        <span className="font-mono text-white">
                            {Number(data.speed).toFixed(1)} <span className="text-slate-500 text-xs">kts</span>
                            {data.speedSource && <span className="ml-1 text-xs text-slate-500">({data.speedSource})</span>}
                        </span>
                    </div>
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-slate-400 text-xs uppercase tracking-wider font-medium">FOC</span>
                        <span className="font-mono text-white">{Number(data.foc).toFixed(2)} <span className="text-slate-500 text-xs">TJ</span></span>
                    </div>
                </div>
            </div>
        );
    }

    // Default Layout for Line/Area
    return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-slate-200 text-sm">
            <div className="font-bold text-slate-300 mb-2 border-b border-slate-700/50 pb-1">Speed: {label} kts</div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {payload.map((entry: any, index: number) => {
                if (entry.name === 'Tolerance (+/- 5%)') {
                    return (
                        <div key={index} className="flex items-center justify-between gap-4 text-xs mt-1">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                                <span className="text-slate-400">Range</span>
                            </div>
                            <span className="font-mono text-slate-200">
                                {entry.value[0].toFixed(2)} - {entry.value[1].toFixed(2)}
                            </span>
                        </div>
                    );
                }
                return (
                    <div key={index} className="flex items-center justify-between gap-4 mt-1">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                            <span className="text-slate-400">{entry.name === 'foc' ? 'Standard FOC' : entry.name}</span>
                        </div>
                        <span className="font-mono text-slate-200">{Number(entry.value).toFixed(2)}</span>
                    </div>
                );
            })}
        </div>
    );
};

const FocAnalysis = () => {
    // ... (lines 19-210)

    <Tooltip
        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
        itemStyle={{ color: '#f8fafc' }}
        formatter={(value: unknown, name: unknown) => {
            if (name === 'focRange') return [`${(value as [number, number])[0].toFixed(2)} - ${(value as [number, number])[1].toFixed(2)}`, 'Tolerance Range'];
            return [Number(value).toFixed(2), name === 'foc' ? 'Daily FOC' : (name as string)];
        }}
        labelFormatter={(label) => `Speed: ${label} kts`}
    />
    const [ships, setShips] = useState<Ship[]>([]);
    const [reports, setReports] = useState<Report[]>([]);
    const [codes, setCodes] = useState<CodeData | null>(null);
    const [selectedShipCode, setSelectedShipCode] = useState<string>('');
    const [selectedVoyage, setSelectedVoyage] = useState<string>('');
    const [selectedReportId, setSelectedReportId] = useState<string>('');
    const [focMode, setFocMode] = useState<'laden' | 'ballast'>('laden');
    const [selectedType, setSelectedType] = useState<string>('');
    const [lngPrice, setLngPrice] = useState<number>(600);
    const [lsmgoPrice, setLsmgoPrice] = useState<number>(850);
    const [analysisMode, setAnalysisMode] = useState<'standard' | 'correction'>('standard');
    const [remark, setRemark] = useState<string>('');
    const [excludedApps, setExcludedApps] = useState<string[]>([]);
    const [weatherFilter, setWeatherFilter] = useState<number | null>(null);
    const [speedFilter, setSpeedFilter] = useState<number | null>(null);



    useEffect(() => {
        const load = async () => {
            try {
                const [sData, rData, cData] = await Promise.all([
                    fetchShips(),
                    fetchReports(),
                    fetchCodes()
                ]);
                setShips(sData);
                setReports(rData);
                setCodes(cData);

                // Default to HLS CARTAGENA if available, else first ship
                const hct = sData.find((s: Ship) => s.code === 'HCT');
                if (hct) {
                    setSelectedShipCode(hct.code);
                } else if (sData.length > 0) {
                    setSelectedShipCode(sData[0].code);
                }
            } catch (err) {
                console.error("Failed to load analysis data", err);
            }
        };
        load();
    }, []);

    // ... existing derived state ...

    const selectedShip = useMemo(() =>
        ships.find(s => s.code === selectedShipCode),
        [ships, selectedShipCode]);

    // Report Analysis Logic
    // Helper to resolve Event Time (prioritizing T-Codes)
    const resolveEventTime = (r: Report) => {
        if (!r.tasks) return r.items['R003'] as string || r.submittedAt;

        // Priority T-Codes for Event Time
        const timeCodes = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10'];

        for (const code of timeCodes) {
            if (r.tasks[code]) return r.tasks[code];
        }

        // Check any other T-code that looks like time (simple check: value holds date format)
        // Or just fallback
        return r.items['R003'] as string || r.submittedAt;
    };

    const activeReports = useMemo(() => {
        const ship = ships.find(s => s.code === selectedShipCode);
        if (!ship) return [];
        return reports
            .filter(r => {
                // Must match ship
                if (r.items['R001'] !== ship.name) return false;

                // Mode Filtering Logic
                const r005 = (r.items['R005'] as string || '').trim();
                const lastChar = r005.slice(-1).toUpperCase();

                if (focMode === 'laden') {
                    // Show only if ends with L
                    return lastChar === 'L';
                } else if (focMode === 'ballast') {
                    // Show only if ends with B
                    return lastChar === 'B';
                }

                return false;
            })
            .sort((a, b) => {
                const tA = new Date(resolveEventTime(a) || 0).getTime();
                const tB = new Date(resolveEventTime(b) || 0).getTime();
                return tB - tA;
            });
    }, [ships, selectedShipCode, reports, focMode]);

    const uniqueVoyages = useMemo(() =>
        Array.from(new Set(activeReports.map(r => r.items['R005'] as string).filter(Boolean))).sort().reverse(),
        [activeReports]
    );

    const displayedReports = useMemo(() =>
        selectedVoyage
            ? activeReports.filter(r => r.items['R005'] === selectedVoyage)
            : activeReports,
        [activeReports, selectedVoyage]
    );

    const selectedReport = useMemo(() =>
        selectedReportId
            ? displayedReports.find(r => r.id === selectedReportId)
            : displayedReports[0],
        [displayedReports, selectedReportId]
    );

    // Reset selectors when ship changes
    const [prevShipCode, setPrevShipCode] = useState(selectedShipCode);
    if (selectedShipCode !== prevShipCode) {
        setPrevShipCode(selectedShipCode);
        setSelectedVoyage('');
        setSelectedReportId('');
        setExcludedApps([]); // Reset excluded apps
        setWeatherFilter(null); // Reset weather filter
        setSpeedFilter(null); // Reset speed filter
    }

    // Update local remark state when report changes
    const [prevReportId, setPrevReportId] = useState(selectedReport?.id);
    if (selectedReport?.id !== prevReportId) {
        setPrevReportId(selectedReport?.id);
        if (selectedReport) {
            setRemark(selectedReport.items['R207'] as string || '');
        } else {
            setRemark('');
        }
    }

    const handleRemarkSave = async () => {
        if (!selectedReport) return;
        try {
            // Update local state first for immediate feedback
            const updatedReport = {
                ...selectedReport,
                items: {
                    ...selectedReport.items,
                    'R207': remark
                }
            };

            setReports(prev => prev.map(r => r.id === selectedReport.id ? updatedReport : r));

            await updateReport(selectedReport.id as string, {
                items: updatedReport.items
            });
        } catch (err) {
            console.error("Failed to save remark", err);
            // Revert on failure (optional, but good practice)
            alert("Failed to save remark. Please try again.");
        }
    };


    // Calculate Fuel Metrics (Normalized to 24h)
    const fuelMetrics = useMemo(() => {
        const ship = ships.find(s => s.code === selectedShipCode);
        if (!ship || !selectedReport) return [];

        // Operation Time (R200) - Default to 24 if missing or 0 to avoid division by zero
        const opTimeStr = selectedReport.items['R200'] as string || selectedReport.items['R011'] as string;
        const opTime = parseFloat(opTimeStr) || 24;
        const normalizationFactor = opTime > 0 ? (24 / opTime) : 1;

        const configShip = ship.configSourceShipId
            ? ships.find(s => s.code === ship.configSourceShipId) || ship
            : ship;

        return configShip.fuels?.map(fuel => {
            const fDef = codes?.fCodes?.find(f => f.code === fuel.code);
            const name = fDef?.name || fuel.code;
            const targetFuel = ship.fuels?.find(f => f.code === fuel.code);
            const rawLcv = (targetFuel?.lcv !== undefined && targetFuel?.lcv !== 0)
                ? targetFuel.lcv
                : (fuel.lcv || fDef?.lcv || 0.0405);

            const lcv = rawLcv;

            let factor = 1;
            if (lcv < 0.1) factor = 1_000_000;
            else if (lcv >= 0.1 && lcv < 100) factor = 1000;
            else if (lcv >= 2000 && lcv < 30000) factor = 4.184;
            else factor = 1;

            const r031Key = `R031_${fuel.code}`;
            let val = parseFloat(selectedReport.items[r031Key] as string) || 0;

            if (val === 0) {
                Object.keys(selectedReport.items).forEach(k => {
                    if (k.startsWith('CONS_') && k.endsWith(`_${fuel.code}`)) {
                        // Check for exclusion
                        const parts = k.split('_');
                        const eqCode = parts[1]; // CONS_E01_1_F01 -> E01
                        if (!excludedApps.includes(eqCode)) {
                            val += parseFloat(selectedReport.items[k] as string) || 0;
                        }
                    }
                });
            } else {
                // If using Total R031, we can't easily exclude specific equipment unless we have breakdown.
                // But typically if breakdown exists, we use it. 
                // If only total exists, we can't subtract unknown portions.
                // However, we can try to subtract known components if they exist in valid keys?
                // For now, simpler logic: If we rely on breakdown aggregation (val===0 initially), exclusion works.
                // If val comes from R031 direct, we might not be able to exclude.
                // OPTION: If exclusions are active, we FORCE calculation from breakdown if possible?

                // Enhanced Logic:
                // If excludedApps is not empty, we MUST try to rebuild total from Non-Excluded components.
                if (excludedApps.length > 0) {
                    let breakdownSum = 0;
                    let hasBreakdown = false;
                    Object.keys(selectedReport.items).forEach(k => {
                        if (!k.startsWith('CONS_')) return;

                        const parts = k.split('_');
                        // CONS_E01_1_F01 -> F01 is at end
                        const itemFuelCode = parts[parts.length - 1];

                        // Match fuel code
                        if (itemFuelCode === fuel.code) {
                            hasBreakdown = true;
                            const eqCode = parts[1];
                            if (!excludedApps.includes(eqCode)) {
                                breakdownSum += parseFloat(selectedReport.items[k] as string) || 0;
                            }
                        }
                    });

                    if (hasBreakdown) {
                        val = breakdownSum;
                    }
                    // If no breakdown found, we can't exclude, so we keep original R031 val (or specific logic?)
                    // User request implies capability to exclude.
                }
            }

            // Normalize Value and Energy
            const normalizedVal = val * normalizationFactor;
            const energy = normalizedVal * lcv * factor;

            return { name, val: normalizedVal, rawVal: val, energy };
        }).filter(f => f.energy > 0 || f.val > 0) || [];
    }, [ships, selectedShipCode, selectedReport, codes, excludedApps]);

    // Calculate Equipment Metrics (Normalized)
    const equipmentMetrics = useMemo(() => {
        if (!selectedReport || !codes?.eCodes || !selectedShip) return [];

        // Operation Time (Reusable)
        const opTimeStr = selectedReport.items['R200'] as string || selectedReport.items['R011'] as string;
        const opTime = parseFloat(opTimeStr) || 24;
        const normalizationFactor = opTime > 0 ? (24 / opTime) : 1;

        const eqMap = new Map<string, { code: string, name: string, val: number, energy: number, fuels: Map<string, { val: number, name: string }> }>();

        Object.entries(selectedReport.items).forEach(([key, value]) => {
            if (!key.startsWith('CONS_')) return;
            const parts = key.split('_');
            if (parts.length < 4) return;

            const fuelCode = parts[parts.length - 1];
            const eqCode = parts[1];

            const rawVal = parseFloat(value as string) || 0;
            if (rawVal === 0) return;

            // Check for exclusion - REMOVED to show all
            // if (excludedApps.includes(eqCode)) return;

            // Normalize
            const val = rawVal * normalizationFactor;

            const eqDef = codes.eCodes.find(e => e.code === eqCode);
            const eqName = eqDef?.name || eqCode;

            const configShip = selectedShip.configSourceShipId
                ? ships.find(s => s.code === selectedShip.configSourceShipId) || selectedShip
                : selectedShip;

            const fuel = configShip.fuels?.find(f => f.code === fuelCode);
            const fDef = codes.fCodes?.find(f => f.code === fuelCode);

            const targetFuel = selectedShip.fuels?.find(f => f.code === fuelCode);
            const rawLcv = (targetFuel?.lcv !== undefined && targetFuel?.lcv !== 0)
                ? targetFuel.lcv
                : (fuel?.lcv || fDef?.lcv || 0.0405);

            let factor = 1;
            if (rawLcv < 0.1) factor = 1_000_000;
            else if (rawLcv >= 0.1 && rawLcv < 100) factor = 1000;
            else if (rawLcv >= 2000 && rawLcv < 30000) factor = 4.184;

            const energy = val * rawLcv * factor;

            if (!eqMap.has(eqCode)) {
                eqMap.set(eqCode, { code: eqCode, name: eqName, val: 0, energy: 0, fuels: new Map() });
            }
            const record = eqMap.get(eqCode)!;
            record.val += val;
            record.energy += energy;

            const fName = fDef?.name || fuel?.code || fuelCode;

            if (!record.fuels.has(fuelCode)) {
                record.fuels.set(fuelCode, { val: 0, name: fName });
            }
            const fRecord = record.fuels.get(fuelCode)!;
            fRecord.val += val;

        });

        return Array.from(eqMap.values()).sort((a, b) => b.energy - a.energy);
    }, [selectedReport, codes, selectedShip, ships]);

    const totalEnergy = fuelMetrics.reduce((sum, item) => sum + item.energy, 0);
    const totalEnergyTJ = totalEnergy / 1_000_000;

    // Helper to resolve Speed (Prioritizing Spot > Average > Calculated)
    const resolveSpeed = useCallback((r: Report) => {
        // Priority 1: R026 (Current/Spot Speed) - Requested by User
        const spottingSpeed = parseFloat(r.items['R026'] as string);
        if (!isNaN(spottingSpeed) && spottingSpeed > 0) return { value: spottingSpeed, source: 'Spot' };

        // Priority 2: R077 (Average Speed)
        const avgSpeed = parseFloat(r.items['R077'] as string);
        if (!isNaN(avgSpeed) && avgSpeed > 0) return { value: avgSpeed, source: 'Avg' };

        // Priority 3: Calculated (Distance / Time)
        const dist = parseFloat(r.items['R013'] as string);
        const time = parseFloat(r.items['R200'] as string || r.items['R011'] as string);
        if (!isNaN(dist) && !isNaN(time) && dist > 0 && time > 0) return { value: dist / time, source: 'Calc' };

        // Fallback: R034
        const r034 = parseFloat(r.items['R034'] as string || '0');
        return { value: r034, source: 'R034' };
    }, []);

    const currentSpeed = useMemo(() => {
        if (!selectedReport) return 0;
        return resolveSpeed(selectedReport).value;
    }, [selectedReport, resolveSpeed]);

    const availableProfiles = useMemo(() => {
        if (!selectedShip?.focManagement) return [];
        return selectedShip.focManagement.filter(p => p.mode === focMode);
    }, [selectedShip, focMode]);

    // Auto-select first profile when list changes
    const prevProfilesIds = useMemo(() => availableProfiles.map(p => p.type).join(','), [availableProfiles]);
    const [prevProfilesHash, setPrevProfilesHash] = useState(prevProfilesIds);
    if (prevProfilesHash !== prevProfilesIds) {
        setPrevProfilesHash(prevProfilesIds);
        if (availableProfiles.length > 0) {
            // Try to keep selection if valid, else pick first
            const exists = availableProfiles.find(p => p.type === selectedType);
            if (!exists) {
                setSelectedType(availableProfiles[0].type);
            }
        } else {
            setSelectedType('');
        }
    }

    const chartData = useMemo(() => {
        const profile = availableProfiles.find(p => p.type === selectedType);
        if (!profile) return [];

        // Clone and sort data by speed
        const sortedData = [...profile.data].sort((a, b) => a.speed - b.speed);

        return sortedData.map(d => ({
            speed: d.speed,
            foc: d.foc,
            // Calculate tolerance range [min, max]
            focRange: [d.foc * 0.95, d.foc * 1.05] as [number, number],
            min: d.foc * 0.95,
            max: d.foc * 1.05
        }));
    }, [availableProfiles, selectedType]);

    const xAxisDomain = useMemo<[number | string, number | string]>(() => {
        if (!speedFilter) return [12, 21];
        if (speedFilter === 10) return [10, 21];
        if (speedFilter === 13) return [13, 21];
        return [12, 21];
    }, [speedFilter]);

    // Helper to calculate total normalized energy for any report
    const getNormalizedEnergy = useCallback((r: Report) => {
        if (!selectedShip || !codes) return 0;

        const opTimeStr = r.items['R200'] as string || r.items['R011'] as string;
        const opTime = parseFloat(opTimeStr) || 24;
        const normFactor = opTime > 0 ? (24 / opTime) : 1;

        const configShip = selectedShip.configSourceShipId
            ? ships.find(s => s.code === selectedShip.configSourceShipId) || selectedShip
            : selectedShip;

        let totalE = 0;

        configShip.fuels?.forEach(fuel => {
            const fDef = codes?.fCodes?.find(f => f.code === fuel.code);
            const targetFuel = selectedShip.fuels?.find(f => f.code === fuel.code);
            const rawLcv = (targetFuel?.lcv !== undefined && targetFuel?.lcv !== 0)
                ? targetFuel.lcv
                : (fuel.lcv || fDef?.lcv || 0.0405);

            let factor = 1;
            if (rawLcv < 0.1) factor = 1_000_000;
            else if (rawLcv >= 0.1 && rawLcv < 100) factor = 1000;
            else if (rawLcv >= 2000 && rawLcv < 30000) factor = 4.184;

            const r031Key = `R031_${fuel.code}`;
            let val = parseFloat(r.items[r031Key] as string) || 0;

            // Check if we need to exclude components
            if (val === 0 || excludedApps.length > 0) {
                let breakdownSum = 0;
                let hasBreakdown = false;

                Object.keys(r.items).forEach(k => {
                    if (!k.startsWith('CONS_')) return;

                    const parts = k.split('_');
                    const itemFuelCode = parts[parts.length - 1];

                    if (itemFuelCode === fuel.code) {
                        const eqCode = parts[1];
                        // Only add if NOT excluded
                        if (!excludedApps.includes(eqCode)) {
                            hasBreakdown = true;
                            breakdownSum += parseFloat(r.items[k] as string) || 0;
                        } else {
                            // Mark as having breakdown so we use the sum (which excludes this item)
                            hasBreakdown = true;
                        }
                    }
                });

                if (hasBreakdown) {
                    val = breakdownSum;
                }
            }

            totalE += (val * normFactor * rawLcv * factor);
        });

        return totalE;
    }, [selectedShip, ships, codes, excludedApps]);

    // Helper to interpolate expected FOC from curve for any speed (TJ/24h)
    const calculateExpectedCurveFoc = useCallback((speed: number) => {
        if (chartData.length < 2 || speed <= 0) return 0;

        // Ensure sorted - chartData is already sorted by speed
        const sorted = chartData;

        if (speed <= sorted[0].speed) return sorted[0].foc;
        if (speed >= sorted[sorted.length - 1].speed) return sorted[sorted.length - 1].foc;

        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i].speed <= speed && sorted[i + 1].speed >= speed) {
                const p1 = sorted[i];
                const p2 = sorted[i + 1];
                const ratio = (speed - p1.speed) / (p2.speed - p1.speed);
                return p1.foc + ratio * (p2.foc - p1.foc);
            }
        }
        return 0;
    }, [chartData]);

    const voyageStats = useMemo(() => {
        if (!displayedReports.length || chartData.length === 0) return null;

        let totalActualTJ = 0;
        let totalExpectedTJ = 0;
        let totalExcessTJ = 0;

        // Filter Reports first
        const statsReports = displayedReports.filter(r => {
            // R137 is Weather B/F
            const bf = parseFloat(r.items['R137'] as string) || 0;
            if (weatherFilter && bf >= weatherFilter) return false;

            // Speed Filter
            const speed = resolveSpeed(r).value;
            if (speedFilter && speed < speedFilter) return false;

            return true;
        });

        statsReports.forEach(r => {
            // Use resolveSpeed here as well
            const speed = resolveSpeed(r).value;
            if (speed <= 0) return;

            const opTimeStr = r.items['R200'] as string || r.items['R011'] as string;
            const opTime = parseFloat(opTimeStr) || 24;

            // Actual MJ
            const normMJ = getNormalizedEnergy(r);
            const actualMJ = normMJ * (opTime / 24);

            // Expected TJ
            const expectedDailyTJ = calculateExpectedCurveFoc(speed);
            const expectedRealTJ = expectedDailyTJ * (opTime / 24);

            const reportActualTJ = actualMJ / 1_000_000;
            const reportExpectedTJ = expectedRealTJ;
            const diff = reportActualTJ - reportExpectedTJ;

            totalActualTJ += reportActualTJ;
            totalExpectedTJ += reportExpectedTJ;

            if (diff > 0) {
                totalExcessTJ += diff;
            }
        });

        let diffTJ = 0;
        if (analysisMode === 'standard') {
            diffTJ = totalActualTJ - totalExpectedTJ;
        } else {
            // Correction mode: Sum of ONLY positive differences (Penalty)
            diffTJ = totalExcessTJ;
        }

        const isSavings = diffTJ < 0;
        const absDiffGJ = Math.abs(diffTJ) * 1000;

        const lngLCV = 50.0;
        const lsmgoLCV = 42.7;

        const lngEq = (lngLCV > 0) ? absDiffGJ / lngLCV : 0;
        const lsmgoEq = (lsmgoLCV > 0) ? absDiffGJ / lsmgoLCV : 0;

        const lngCost = lngEq * lngPrice;
        const lsmgoCost = lsmgoEq * lsmgoPrice;

        return {
            diffTJ, isSavings, absDiffGJ, lngEq, lsmgoEq, lngCost, lsmgoCost
        };

    }, [displayedReports, chartData, getNormalizedEnergy, lngPrice, lsmgoPrice, analysisMode, weatherFilter, speedFilter, resolveSpeed, calculateExpectedCurveFoc]);

    const voyageNoonData = useMemo(() => {
        if (!displayedReports.length) return [];
        return displayedReports
            .filter(r => {
                const evName = (codes?.evCodes.find(e => e.code === r.evCode)?.name || '').toLowerCase();
                const r004 = (r.items['R004'] as string || '').toLowerCase();

                // Weather Filter
                if (weatherFilter) {
                    const bf = parseFloat(r.items['R137'] as string) || 0;
                    if (bf >= weatherFilter) return false;
                }

                // Speed Filter (Use Correct Logic)
                const speed = resolveSpeed(r).value;
                if (speedFilter && speed < speedFilter) return false;

                // Filter for Noon Reports
                return r.evCode === 'N' || evName.includes('noon') || r004.includes('noon');
            })
            .map(r => {
                let dateStr = resolveEventTime(r);
                // Handle Excel Serial Date
                if (dateStr && !isNaN(Number(dateStr)) && !dateStr.includes('-')) {
                    const serial = Number(dateStr);
                    const dateObj = new Date(Math.round((serial - 25569) * 86400 * 1000));
                    dateStr = dateObj.toISOString().split('T')[0];
                } else if (dateStr) {
                    dateStr = dateStr.split('T')[0];
                }

                const resolved = resolveSpeed(r);
                const evDef = codes?.evCodes?.find(e => e.code === r.evCode);

                return {
                    speed: resolved.value,
                    speedSource: resolved.source,
                    foc: getNormalizedEnergy(r) / 1_000_000, // Convert MJ to TJ
                    date: dateStr,
                    name: r.items['R004'] as string || 'Noon Report',
                    eventType: evDef?.name || r.evCode,
                    location: r.items['R002'] as string || ''
                };
            })
            .filter(d => d.speed > 0 && d.foc > 0);
    }, [displayedReports, codes, weatherFilter, speedFilter, getNormalizedEnergy, resolveSpeed]); // Add filters dependency

    // Derived: Available Equipment for Toggles (from current report)
    const availableEquipment = useMemo(() => {
        if (!selectedReport || !codes?.eCodes) return [];
        const eqs = new Set<string>();
        Object.keys(selectedReport.items).forEach(k => {
            if (k.startsWith('CONS_')) {
                const parts = k.split('_');
                if (parts.length >= 2) {
                    eqs.add(parts[1]);
                }
            }
        });
        return Array.from(eqs).map(code => ({
            code,
            name: codes.eCodes.find(e => e.code === code)?.name || code
        })).sort((a, b) => a.code.localeCompare(b.code));
    }, [selectedReport, codes]);

    const toggleAppExclusion = (code: string) => {
        setExcludedApps(prev =>
            prev.includes(code)
                ? prev.filter(c => c !== code)
                : [...prev, code]
        );
    };



    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center px-1">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <Activity className="text-emerald-400" size={32} />
                        FOC Analysis
                    </h1>
                    <p className="text-slate-400 mt-2">
                        Analyze Fuel Oil Consumption trends with standard tolerance bands (+/- 5%).
                    </p>
                </div>
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-lg transition-colors print:hidden"
                >
                    <Printer size={20} />
                    <span className="font-bold">Print PDF</span>
                </button>
            </div>

            {/* Controls */}
            <div className="bg-ocean-800 rounded-2xl p-6 border border-ocean-700 shadow-xl relative z-20">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    {/* Ship Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <ShipIcon size={14} /> Vessel
                        </label>
                        <select
                            className="w-full bg-ocean-900 border border-ocean-600 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium appearance-none"
                            value={selectedShipCode}
                            onChange={(e) => setSelectedShipCode(e.target.value)}
                        >
                            <option value="">Select Vessel...</option>
                            {ships.map(s => (
                                <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                            ))}
                        </select>
                    </div>

                    {/* Mode Toggle */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <Droplet size={14} /> Mode
                        </label>
                        <div className="flex bg-ocean-900 p-1 rounded-xl border border-ocean-600">
                            {(['laden', 'ballast'] as const).map(m => (
                                <button
                                    key={m}
                                    onClick={() => setFocMode(m)}
                                    className={cn(
                                        "flex-1 py-2 px-4 rounded-lg text-sm font-bold uppercase transition-all duration-300",
                                        focMode === m
                                            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-[1.02]"
                                            : "text-slate-400 hover:text-emerald-300 hover:bg-ocean-800"
                                    )}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Type Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <Zap size={14} /> Profile Type
                        </label>
                        <select
                            className="w-full bg-ocean-900 border border-ocean-600 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium disabled:opacity-50"
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            disabled={availableProfiles.length === 0}
                        >
                            {availableProfiles.length === 0 && <option>No profiles available</option>}
                            {availableProfiles.map(p => (
                                <option key={p.id} value={p.type}>{p.type}</option>
                            ))}
                        </select>
                    </div>

                    {/* Stats Summary (Placeholder) */}
                    <div className="space-y-2">
                        <div className="bg-ocean-900/50 border border-ocean-700 rounded-xl p-3 flex items-center justify-between">
                            <div className="text-slate-400 text-xs font-medium">Data Points</div>
                            <div className="text-emerald-400 font-bold text-lg">{chartData.length}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chart Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
                <div className="lg:col-span-3 bg-ocean-800 rounded-2xl p-6 border border-ocean-700 shadow-xl min-h-[500px] flex flex-col">
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Activity className="text-emerald-400" size={20} />
                            Performance Curve
                        </h2>
                        {selectedType && (
                            <div className="flex items-center gap-3 text-sm">
                                <span className="flex items-center gap-2 text-slate-300">
                                    <span className="w-3 h-3 rounded-full bg-blue-500"></span> Standard
                                </span>
                                <span className="flex items-center gap-2 text-slate-300">
                                    <span className="w-3 h-3 rounded-sm bg-red-500/30 border border-red-500/50"></span> +/- 5% Tolerance
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 w-full min-h-[400px]">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart
                                    width={500}
                                    height={400}
                                    data={chartData}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis
                                        dataKey="speed"
                                        type="number"
                                        domain={xAxisDomain}
                                        allowDataOverflow={true}
                                        tick={{ fill: '#94a3b8' }}
                                        label={{ value: 'Speed (kts)', position: 'insideBottom', offset: -10, fill: '#cbd5e1' }}
                                    />
                                    <YAxis
                                        dataKey="foc"
                                        tick={{ fill: '#94a3b8' }}
                                        label={{ value: 'Daily FOC (TJ)', angle: -90, position: 'insideLeft', offset: 0, fill: '#cbd5e1' }}
                                        domain={['auto', 'auto']}
                                    />

                                    {/* Tolerance Band Area */}
                                    <Area
                                        type="monotone"
                                        dataKey="focRange"
                                        stroke="none"
                                        fill="#ef4444"
                                        fillOpacity={0.2}
                                        name="Tolerance (+/- 5%)"
                                        isAnimationActive={false}
                                        style={{ pointerEvents: 'none' }}
                                    />

                                    {/* Main Line */}
                                    <Line
                                        type="monotone"
                                        dataKey="foc"
                                        stroke="#3b82f6"
                                        strokeWidth={3}
                                        dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                                        activeDot={{ r: 6, fill: '#cbd5e1' }}
                                        name="Standard FOC"
                                        isAnimationActive={false}
                                    />

                                    {/* Current Report Point */}
                                    {selectedReport && totalEnergyTJ > 0 && currentSpeed > 0 && (
                                        <ReferenceDot
                                            x={currentSpeed}
                                            y={totalEnergyTJ}
                                            r={6}
                                            fill="#ef4444"
                                            stroke="#fff"
                                            strokeWidth={2}
                                            label={{ position: 'top', value: 'Current', fill: '#ef4444', fontSize: 12 }}
                                        />
                                    )}

                                    <Scatter
                                        name="Voyage Noon Reports"
                                        data={voyageNoonData}
                                        fill="#fbbf24"
                                        line={false}
                                        shape="circle"
                                        isAnimationActive={false}
                                        r={6}
                                        cursor="pointer"
                                    />

                                    <Tooltip
                                        shared={false}
                                        cursor={{ strokeDasharray: '3 3' }}
                                        content={<CustomTooltip />}
                                        isAnimationActive={false}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 border-2 border-dashed border-ocean-700/50 rounded-xl">
                                <AlertCircle size={48} className="mb-4 opacity-50" />
                                <p className="text-lg font-medium">No Data Available</p>
                                <p className="text-sm">Select a valid ship and profile configuration.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Report Analysis Section */}
            <div className="bg-ocean-800 rounded-2xl p-6 border border-ocean-700 shadow-xl">
                <div className="flex items-center gap-2 mb-6 text-emerald-400">
                    <History size={24} />
                    <h2 className="text-xl font-bold text-white">Daily Report Analysis</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    {/* Controls Side */}
                    <div className="lg:col-span-4 space-y-4">
                        <div className="bg-ocean-900/50 p-4 rounded-xl border border-ocean-700/50 space-y-4">
                            {/* Voyage Selector */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <MapIcon size={12} /> Voyage
                                </label>
                                <select
                                    className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
                                    value={selectedVoyage}
                                    onChange={(e) => {
                                        setSelectedVoyage(e.target.value);
                                        setSelectedReportId('');
                                    }}
                                >
                                    <option value="">All Voyages</option>
                                    {uniqueVoyages.map(v => (
                                        <option key={v} value={v}>Voyage {v}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Event/Date Selector */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <Calendar size={12} /> Event Date
                                </label>
                                <select
                                    className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
                                    value={selectedReportId}
                                    onChange={(e) => setSelectedReportId(e.target.value)}
                                >
                                    <option value="">Select Event...</option>
                                    {displayedReports.map(r => {
                                        const ev = codes?.evCodes.find(e => e.code === r.evCode)?.name || r.evCode;
                                        const date = resolveEventTime(r);
                                        const displayDate = date?.replace('T', ' ').substring(0, 16);
                                        return (
                                            <option key={r.id} value={r.id as string}>
                                                {displayDate} - {ev}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        </div>

                        {/* Fuel Price Settings */}
                        <div className="bg-ocean-900/50 p-4 rounded-xl border border-ocean-700/50 space-y-4">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-2">
                                <span className="text-emerald-400">$</span> Fuel Prices (USD/MT)
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-400 font-medium ml-1">LNG</label>
                                    <input
                                        type="number"
                                        className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 text-right"
                                        value={lngPrice}
                                        onChange={(e) => setLngPrice(Math.max(0, Number(e.target.value)))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-400 font-medium ml-1">LSMGO</label>
                                    <input
                                        type="number"
                                        className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 text-right"
                                        value={lsmgoPrice}
                                        onChange={(e) => setLsmgoPrice(Math.max(0, Number(e.target.value)))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Analysis Condition */}
                        <div className="bg-ocean-900/50 p-4 rounded-xl border border-ocean-700/50 space-y-4">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-2">
                                <span className="text-purple-400">⚡</span> Analysis Condition
                            </label>

                            {/* Equipment Toggles */}
                            <div className="space-y-2">
                                <div className="text-[10px] text-slate-400 font-medium">Excluded Equipment</div>
                                <div className="flex flex-wrap gap-2">
                                    {availableEquipment.length > 0 ? (
                                        availableEquipment.map(eq => {
                                            const isExcluded = excludedApps.includes(eq.code);
                                            return (
                                                <button
                                                    key={eq.code}
                                                    onClick={() => toggleAppExclusion(eq.code)}
                                                    className={cn(
                                                        "px-2 py-1.5 rounded-lg text-xs font-bold transition-all border",
                                                        isExcluded
                                                            ? "bg-slate-800/50 text-slate-500 border-slate-700 line-through decoration-2 decoration-slate-500/50"
                                                            : "bg-purple-500/10 text-purple-300 border-purple-500/30 hover:bg-purple-500/20"
                                                    )}
                                                >
                                                    {eq.name}
                                                </button>
                                            );
                                        })
                                    ) : (
                                        <div className="text-xs text-slate-500 italic px-2">No breakdown data available</div>
                                    )}
                                </div>
                            </div>

                            {/* Weather Filter */}
                            <div className="space-y-2 pt-2 border-t border-ocean-700/30">
                                <div className="text-[10px] text-slate-400 font-medium">Weather Filter (B/F)</div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setWeatherFilter(prev => prev === 5 ? null : 5)}
                                        className={cn(
                                            "flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all border",
                                            weatherFilter === 5
                                                ? "bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20"
                                                : "bg-ocean-800 text-slate-400 border-ocean-600 hover:border-slate-500"
                                        )}
                                    >
                                        ≥ 5
                                    </button>
                                    <button
                                        onClick={() => setWeatherFilter(prev => prev === 6 ? null : 6)}
                                        className={cn(
                                            "flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all border",
                                            weatherFilter === 6
                                                ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-600/20"
                                                : "bg-ocean-800 text-slate-400 border-ocean-600 hover:border-slate-500"
                                        )}
                                    >
                                        ≥ 6
                                    </button>
                                </div>
                            </div>

                            {/* Speed Filter */}
                            <div className="space-y-2 pt-2 border-t border-ocean-700/30">
                                <div className="text-[10px] text-slate-400 font-medium">Speed Filter (kts)</div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setSpeedFilter(prev => prev === 10 ? null : 10)}
                                        className={cn(
                                            "flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all border",
                                            speedFilter === 10
                                                ? "bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20"
                                                : "bg-ocean-800 text-slate-400 border-ocean-600 hover:border-slate-500"
                                        )}
                                    >
                                        &lt; 10
                                    </button>
                                    <button
                                        onClick={() => setSpeedFilter(prev => prev === 13 ? null : 13)}
                                        className={cn(
                                            "flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all border",
                                            speedFilter === 13
                                                ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20"
                                                : "bg-ocean-800 text-slate-400 border-ocean-600 hover:border-slate-500"
                                        )}
                                    >
                                        &lt; 13
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Breakdown Side */}
                    <div className="lg:col-span-8">
                        {selectedReport && (
                            <div className="grid grid-cols-4 gap-6 mb-6">
                                <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-6 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Zap size={56} className="text-indigo-400" />
                                    </div>
                                    <h3 className="text-indigo-300 font-bold mb-2 flex items-center gap-2 text-xs uppercase tracking-wider">
                                        Energy
                                    </h3>
                                    <div className="text-3xl font-bold text-white tracking-tight">
                                        {(totalEnergy / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-lg text-slate-400 font-normal">GJ</span>
                                    </div>
                                    <div className="text-xs text-indigo-400/70 mt-1 truncate">
                                        {fuelMetrics.length} sources
                                    </div>
                                </div>

                                <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Activity size={56} className="text-emerald-400" />
                                    </div>
                                    <h3 className="text-emerald-300 font-bold mb-2 flex items-center gap-2 text-xs uppercase tracking-wider">
                                        Speed
                                    </h3>
                                    <div className="text-3xl font-bold text-white tracking-tight">
                                        {currentSpeed.toFixed(1)} <span className="text-lg text-slate-400 font-normal">kts</span>
                                    </div>
                                    <div className="text-xs text-emerald-400/70 mt-1 truncate">
                                        {selectedReport.items['R004'] as string || 'Noon'}
                                    </div>
                                </div>

                                <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-6 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <History size={56} className="text-blue-400" />
                                    </div>
                                    <h3 className="text-blue-300 font-bold mb-2 flex items-center gap-2 text-xs uppercase tracking-wider">
                                        Time
                                    </h3>
                                    <div className="text-3xl font-bold text-white tracking-tight">
                                        {parseFloat(selectedReport.items['R200'] as string || selectedReport.items['R011'] as string || '24').toFixed(2)} <span className="text-lg text-slate-400 font-normal">h</span>
                                    </div>
                                    <div className="text-xs text-blue-400/70 mt-1 truncate">
                                        Normalized
                                    </div>
                                </div>

                                <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-6 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <AlertCircle size={56} className="text-amber-400" />
                                    </div>
                                    <h3 className="text-amber-300 font-bold mb-2 flex items-center gap-2 text-xs uppercase tracking-wider">
                                        Weather
                                    </h3>
                                    <div className="text-3xl font-bold text-white tracking-tight">
                                        {selectedReport.items['R137'] as string || '-'} <span className="text-lg text-slate-400 font-normal">B/F</span>
                                    </div>
                                    <div className="text-xs text-amber-400/70 mt-1 truncate">
                                        Sea State
                                    </div>
                                </div>
                            </div>
                        )}
                        {renderMetricsContent(fuelMetrics.length > 0, fuelMetrics, equipmentMetrics, excludedApps)}
                    </div>

                    {/* Analysis Cards (Moved to Bottom) */}
                    {selectedReport && (() => {
                        // Calculate Expected Energy at Current Speed
                        if (chartData.length < 2 || currentSpeed <= 0) return null;

                        let expectedTJ = 0;
                        const sorted = chartData; // already sorted by speed

                        if (currentSpeed <= sorted[0].speed) {
                            expectedTJ = sorted[0].foc;
                        } else if (currentSpeed >= sorted[sorted.length - 1].speed) {
                            expectedTJ = sorted[sorted.length - 1].foc;
                        } else {
                            // Interpolate
                            for (let i = 0; i < sorted.length - 1; i++) {
                                if (sorted[i].speed <= currentSpeed && sorted[i + 1].speed >= currentSpeed) {
                                    const p1 = sorted[i];
                                    const p2 = sorted[i + 1];
                                    const ratio = (currentSpeed - p1.speed) / (p2.speed - p1.speed);
                                    expectedTJ = p1.foc + ratio * (p2.foc - p1.foc);
                                    break;
                                }
                            }
                        }

                        const actualGJ = totalEnergy / 1000;
                        const expectedGJ = expectedTJ * 1000;
                        const diffGJ = actualGJ - expectedGJ;
                        const isSavings = diffGJ < 0;
                        const absDiff = Math.abs(diffGJ);

                        // Actual diff based on Op Time
                        const opTimeVal = parseFloat(selectedReport.items['R200'] as string || selectedReport.items['R011'] as string || '24');
                        const diffActual = diffGJ * (opTimeVal / 24);
                        const absDiffActual = Math.abs(diffActual);
                        const showActual = Math.abs(opTimeVal - 24) > 0.1;

                        // Fuel Equivalents (LCV Based)
                        const lngLCV = 50.0; // GJ/MT default
                        const lsmgoLCV = 42.7; // GJ/MT default

                        const lngEq = (lngLCV > 0 && !isNaN(absDiffActual)) ? absDiffActual / lngLCV : 0;
                        const lsmgoEq = (lsmgoLCV > 0 && !isNaN(absDiffActual)) ? absDiffActual / lsmgoLCV : 0;


                        // Cost Estimation
                        // Prices are now from state: lngPrice, lsmgoPrice
                        const lngCost = lngEq * lngPrice;
                        const lsmgoCost = lsmgoEq * lsmgoPrice;

                        // Helper for safe display
                        const safeVal = (v: number) => isNaN(v) || !isFinite(v) ? '0.00' : v.toFixed(2);

                        return (
                            <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-6 lg:col-span-12 mt-6">
                                {/* Remark Section */}
                                <div className="col-span-1 md:col-span-4 bg-ocean-900/40 border border-ocean-700/50 rounded-xl p-6 relative group focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
                                    <h3 className="text-blue-300 font-bold mb-3 flex items-center gap-2 text-sm uppercase">
                                        Remark(Eng.)
                                    </h3>
                                    <textarea
                                        className="w-full h-32 bg-transparent text-slate-300 placeholder-slate-600 resize-none outline-none font-mono text-sm leading-relaxed"
                                        placeholder="Enter remarks here..."
                                        value={remark}
                                        onChange={(e) => setRemark(e.target.value)}
                                        onBlur={handleRemarkSave}
                                    />
                                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-slate-500">
                                        Auto-saved on blur
                                    </div>
                                    <div className="absolute left-0 top-10 bottom-4 w-1 bg-ocean-800 rounded-r-full group-focus-within:bg-blue-500/50 transition-colors"></div>
                                </div>

                                {/* vs Curve Card */}
                                <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-6">
                                    <h3 className="text-purple-300 font-bold mb-3 flex items-center gap-2 text-sm uppercase">
                                        <Activity size={16} /> vs Curve ({selectedType})
                                    </h3>
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                        <div className={cn(
                                            "text-3xl font-bold tracking-tight flex items-center gap-2",
                                            isSavings ? "text-emerald-400" : "text-red-400"
                                        )}>
                                            {isSavings ? <ArrowDown size={24} /> : <ArrowUp size={24} />}
                                            {safeVal(absDiff)} <span className="text-lg text-slate-400 font-normal">GJ</span>
                                        </div>

                                        {showActual && (
                                            <div className="text-sm font-medium text-slate-400">
                                                ({safeVal(absDiffActual)} GJ act.)
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-xs text-purple-400/70 mt-2">
                                        {isSavings ? 'Savings' : 'Excess'} @ {currentSpeed.toFixed(1)} kts
                                    </div>
                                </div>

                                {/* LNG Equivalent */}
                                <div className="bg-ocean-900 border border-ocean-700 rounded-xl p-6 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Fuel size={56} className="text-blue-400" />
                                    </div>
                                    <h3 className="text-slate-400 font-bold mb-2 text-xs uppercase tracking-wider">LNG Equiv.</h3>
                                    <div className={cn(
                                        "text-3xl font-bold tracking-tight",
                                        isSavings ? "text-emerald-400" : "text-red-400"
                                    )}>
                                        {safeVal(lngEq)} <span className="text-lg text-slate-500 font-medium">MT</span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-2">Based on LCV {lngLCV} GJ/MT</div>
                                </div>

                                {/* LSMGO Equivalent */}
                                <div className="bg-ocean-900 border border-ocean-700 rounded-xl p-6 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Droplet size={56} className="text-amber-400" />
                                    </div>
                                    <h3 className="text-slate-400 font-bold mb-2 text-xs uppercase tracking-wider">LSMGO Equiv.</h3>
                                    <div className={cn(
                                        "text-3xl font-bold tracking-tight",
                                        isSavings ? "text-emerald-400" : "text-red-400"
                                    )}>
                                        {safeVal(lsmgoEq)} <span className="text-lg text-slate-500 font-medium">MT</span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-2">Based on LCV {lsmgoLCV} GJ/MT</div>
                                </div>

                                {/* Cost Estimation */}
                                <div className="bg-ocean-900 border border-ocean-700 rounded-xl p-6 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <span className="text-5xl font-bold text-emerald-400">$</span>
                                    </div>
                                    <h3 className="text-slate-400 font-bold mb-3 text-xs uppercase tracking-wider">Est. Cost</h3>

                                    <div className="space-y-3">
                                        <div>
                                            <div className="flex justify-between items-baseline mb-1">
                                                <span className="text-xs text-slate-500 font-bold">LNG</span>
                                                <span className="text-[10px] text-slate-600">(@ ${lngPrice}/MT)</span>
                                            </div>
                                            <div className={cn(
                                                "text-2xl font-bold tracking-tight",
                                                isSavings ? "text-emerald-400" : "text-red-400"
                                            )}>
                                                $ {safeVal(lngCost)}
                                            </div>
                                        </div>

                                        <div className="border-t border-ocean-800 pt-2">
                                            <div className="flex justify-between items-baseline mb-1">
                                                <span className="text-xs text-slate-500 font-bold">LSMGO</span>
                                                <span className="text-[10px] text-slate-600">(@ ${lsmgoPrice}/MT)</span>
                                            </div>
                                            <div className={cn(
                                                "text-2xl font-bold tracking-tight",
                                                isSavings ? "text-emerald-400" : "text-red-400"
                                            )}>
                                                $ {safeVal(lsmgoCost)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Voyage Cumulative Analysis */}
            {
                voyageStats && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <div className="flex items-center gap-3">
                                <History size={24} className="text-emerald-400" />
                                <h2 className="text-xl font-bold text-white">Voyage Cumulative Analysis (Voyage {selectedVoyage || 'All'})</h2>
                            </div>
                            <div className="flex bg-ocean-900 p-1 rounded-lg border border-ocean-600">
                                <button
                                    onClick={() => setAnalysisMode('standard')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all",
                                        analysisMode === 'standard'
                                            ? "bg-blue-500 text-white shadow-lg"
                                            : "text-slate-400 hover:text-blue-300 hover:bg-ocean-800"
                                    )}
                                >
                                    Standard
                                </button>
                                <button
                                    onClick={() => setAnalysisMode('correction')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all",
                                        analysisMode === 'correction'
                                            ? "bg-red-500 text-white shadow-lg"
                                            : "text-slate-400 hover:text-red-300 hover:bg-ocean-800"
                                    )}
                                >
                                    Correction
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            {/* Voyage vs Curve */}
                            <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-6">
                                <h3 className="text-purple-300 font-bold mb-3 flex items-center gap-2 text-sm uppercase">
                                    <Activity size={16} /> Voyage vs Curve
                                </h3>
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "text-3xl font-bold tracking-tight flex items-center gap-2",
                                        voyageStats!.isSavings ? "text-emerald-400" : "text-red-400"
                                    )}>
                                        {voyageStats!.isSavings ? <ArrowDown size={24} /> : <ArrowUp size={24} />}
                                        {voyageStats!.absDiffGJ.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg text-slate-400 font-normal">GJ</span>
                                    </div>
                                </div>
                                <div className="text-xs text-purple-400/70 mt-2">
                                    Total {voyageStats!.isSavings ? 'Savings' : 'Excess'} for Voyage
                                </div>
                            </div>

                            {/* Voyage LNG Equiv */}
                            <div className="bg-ocean-900 border border-ocean-700 rounded-xl p-6 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Fuel size={56} className="text-blue-400" />
                                </div>
                                <h3 className="text-slate-400 font-bold mb-2 text-xs uppercase tracking-wider">Voyage LNG Equiv.</h3>
                                <div className={cn(
                                    "text-3xl font-bold tracking-tight",
                                    voyageStats!.isSavings ? "text-emerald-400" : "text-red-400"
                                )}>
                                    {voyageStats!.lngEq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg text-slate-500 font-medium">MT</span>
                                </div>
                                <div className="text-xs text-slate-500 mt-2">Cumulative</div>
                            </div>

                            {/* Voyage LSMGO Equiv */}
                            <div className="bg-ocean-900 border border-ocean-700 rounded-xl p-6 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Droplet size={56} className="text-amber-400" />
                                </div>
                                <h3 className="text-slate-400 font-bold mb-2 text-xs uppercase tracking-wider">Voyage LSMGO Equiv.</h3>
                                <div className={cn(
                                    "text-3xl font-bold tracking-tight",
                                    voyageStats!.isSavings ? "text-emerald-400" : "text-red-400"
                                )}>
                                    {voyageStats!.lsmgoEq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg text-slate-500 font-medium">MT</span>
                                </div>
                                <div className="text-xs text-slate-500 mt-2">Cumulative</div>
                            </div>

                            {/* Voyage Est. Cost */}
                            <div className="bg-ocean-900 border border-ocean-700 rounded-xl p-6 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <span className="text-5xl font-bold text-emerald-400">$</span>
                                </div>
                                <h3 className="text-slate-400 font-bold mb-3 text-xs uppercase tracking-wider">Voyage Est. Cost</h3>

                                <div className="space-y-3">
                                    <div>
                                        <div className="flex justify-between items-baseline mb-1">
                                            <span className="text-xs text-slate-500 font-bold">LNG</span>
                                        </div>
                                        <div className={cn(
                                            "text-2xl font-bold tracking-tight",
                                            voyageStats!.isSavings ? "text-emerald-400" : "text-red-400"
                                        )}>
                                            $ {voyageStats!.lngCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>

                                    <div className="border-t border-ocean-800 pt-2">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <span className="text-xs text-slate-500 font-bold">LSMGO</span>
                                        </div>
                                        <div className={cn(
                                            "text-2xl font-bold tracking-tight",
                                            voyageStats!.isSavings ? "text-emerald-400" : "text-red-400"
                                        )}>
                                            $ {voyageStats!.lsmgoCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );
};

// Helper for rendering metrics to keep main JSX clean
const renderMetricsContent = (hasData: boolean, fuelMetrics: any[], equipmentMetrics: any[] = [], excludedApps: string[] = []) => {
    if (!hasData) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-ocean-700/50 rounded-xl p-8">
                <Fuel size={48} className="mb-4 opacity-50" />
                <p>Select a report to view energy analysis</p>
            </div>
        );
    }

    const totalEnergy = fuelMetrics.reduce((sum, f) => sum + f.energy, 0);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-ocean-900/30 rounded-xl border border-ocean-700/50 p-4">
                    <div className="flex justify-between items-end mb-4 px-2">
                        <h4 className="text-sm font-bold text-slate-300">Fuel Consumption Breakdown</h4>
                        <div className="text-right">
                            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Total Energy</div>
                            <div className="text-xl font-bold text-emerald-400 leading-none">
                                {(totalEnergy / 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm text-emerald-500/70 font-medium">GJ</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={fuelMetrics}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="val"
                                >
                                    {fuelMetrics.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                                    itemStyle={{ color: '#f8fafc' }}
                                    formatter={(val: any) => [Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MT (24h)', 'Consumption']}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="space-y-3 overflow-y-auto max-h-[250px] pr-2 custom-scrollbar">
                    {fuelMetrics.map((f, i) => (
                        <div key={i} className="bg-ocean-900 p-3 rounded-lg border border-ocean-700 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                <span className="font-medium text-slate-200">{f.name}</span>
                            </div>
                            <div className="text-right">
                                <div className="font-bold text-white">{f.val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs text-slate-500">MT (24h)</span></div>
                                <div className="text-xs text-emerald-400">{(f.energy / 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GJ</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {equipmentMetrics.length > 0 && (
                <div className="bg-ocean-900/30 rounded-xl border border-ocean-700/50 p-4">
                    <h4 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                        <Zap size={16} className="text-emerald-400" />
                        Equipment Breakdown
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {equipmentMetrics.map((eq, i) => {
                            const isExcluded = excludedApps.includes(eq.code);
                            return (
                                <div key={i} className={cn(
                                    "bg-ocean-900 p-3 rounded-lg border",
                                    isExcluded ? "border-slate-700 opacity-60" : "border-ocean-700"
                                )}>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-bold text-slate-200 flex items-center gap-2">
                                            {eq.name}
                                            {isExcluded && <span className="text-[10px] text-red-400 border border-red-500/30 px-1 rounded bg-red-500/10">EXCL</span>}
                                        </span>
                                        <div className="text-right">
                                            <div className="font-bold text-white">{eq.val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs text-slate-500">MT (24h)</span></div>
                                            <div className="text-xs text-emerald-400">{(eq.energy / 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GJ</div>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        {Array.from(eq.fuels.values()).map((f: any) => (
                                            <div key={f.name} className="flex justify-between text-xs text-slate-400">
                                                <span>{f.name}</span>
                                                <span>{f.val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FocAnalysis;
