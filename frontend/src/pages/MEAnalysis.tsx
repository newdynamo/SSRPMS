import { useState, useEffect, useMemo } from 'react';
import { Activity, Ship as ShipIcon, AlertTriangle, Calendar, Gauge } from 'lucide-react';
import { fetchShips } from '../api/ships';
import { fetchReports } from '../api/reports';
import { fetchCodes } from '../api/codes';
import type { Ship, Report, CodeData } from '../types/index';
import { cn } from '../utils/cn';
import {
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine,
    Scatter,
} from 'recharts';
import { format, parseISO, differenceInDays } from 'date-fns';

// Types for processed M/E Data
interface MEDataPoint {
    date: string;
    timestamp: number;
    speed: number;
    rpmPort: number;
    hpPort: number;
    rpmStbd: number;
    hpStbd: number;
    totalHp: number;
    isLaden?: boolean;
    voyage?: string;
    devPort?: number;
    devStbd?: number;
    maRpmStbd?: number;
    maHpStbd?: number;
    mjPerHpPort?: number;
    mjPerHpStbd?: number;
}



const MEAnalysis = () => {
    const [ships, setShips] = useState<Ship[]>([]);
    const [selectedShipCode, setSelectedShipCode] = useState<string>('');
    const [reports, setReports] = useState<Report[]>([]);
    const [codes, setCodes] = useState<CodeData | null>(null);
    const [alpha, setAlpha] = useState<number>(15.0); // Threshold % (3-50)
    const [tempAlpha, setTempAlpha] = useState<number>(15.0); // Temporary Input State
    const [maWindow, setMaWindow] = useState<number>(10); // Moving Average Window (5, 10, 15, 20)

    // Period Analysis State
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [periodType, setPeriodType] = useState<'year' | 'half' | 'quarter' | 'month'>('year');
    const [periodValue, setPeriodValue] = useState<number>(1); // 1-12 (Month), 1-4 (Quarter), 1-2 (Half)

    // Condition State (Laden / Ballast)
    const [condition, setCondition] = useState<'laden' | 'ballast'>('laden');

    // Load Ships
    useEffect(() => {
        const load = async () => {
            try {
                const [sData, cData] = await Promise.all([fetchShips(), fetchCodes()]);
                setShips(sData);
                setCodes(cData);
                const hct = sData.find((s: Ship) => s.code === 'HCT');
                if (hct) setSelectedShipCode(hct.code);
                else if (sData.length > 0) setSelectedShipCode(sData[0].code);
            } catch (err) {
                console.error("Failed to load initial data", err);
            }
        };
        load();
    }, []);

    // Load Reports
    useEffect(() => {
        if (!selectedShipCode) return;
        const loadReports = async () => {
            try {
                const rData = await fetchReports();
                // Filter by ship and sort ASCENDING by date for processing
                const shipReports = rData
                    .filter((r: Report) => r.items['R001'] === ships.find(s => s.code === selectedShipCode)?.name)
                    .sort((a: Report, b: Report) => {
                        const dateA = a.tasks?.['T04'] || a.submittedAt || '';
                        const dateB = b.tasks?.['T04'] || b.submittedAt || '';
                        return new Date(dateA).getTime() - new Date(dateB).getTime();
                    });
                setReports(shipReports);
            } catch (err) {
                console.error("Failed to fetch reports", err);
            }
        };
        loadReports();
    }, [selectedShipCode, ships]);

    // specific helper for parsing floats safely
    const parseVal = (val: any) => {
        const f = parseFloat(val);
        return isNaN(f) ? 0 : f;
    };

    // Calculate Moving Average Helper
    const calculateMA = (data: number[], window: number) => {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            const start = Math.max(0, i - window + 1);
            const subset = data.slice(start, i + 1);
            const sum = subset.reduce((a, b) => a + b, 0);
            result.push(sum / subset.length);
        }
        return result;
    };

    // Helper: Linear Interpolation for Reference Power
    const getReferencePower = (rpm: number, curve: { rpm: number, power: number }[]) => {
        if (!curve || curve.length === 0) return 0;
        // Sort by RPM
        const sorted = [...curve].sort((a, b) => a.rpm - b.rpm);

        // Find surrounding points
        for (let i = 0; i < sorted.length - 1; i++) {
            const p1 = sorted[i];
            const p2 = sorted[i + 1];
            if (rpm >= p1.rpm && rpm <= p2.rpm) {
                // Interpolate
                const ratio = (rpm - p1.rpm) / (p2.rpm - p1.rpm);
                return p1.power + ratio * (p2.power - p1.power);
            }
        }

        // Extrapolation or out of bounds
        if (rpm < sorted[0].rpm) return sorted[0].power; // Clamp to min
        if (rpm > sorted[sorted.length - 1].rpm) return sorted[sorted.length - 1].power; // Clamp to max

        return 0;
    };

    // Process Data (Memoized)
    const { chartData, portAnalysis, stbdAnalysis, portPrediction, stbdPrediction, baselinePort, baselineStbd, currentMjPort, currentMjStbd, ladenCount, ballastCount } = useMemo(() => {
        console.log("MEAnalysis useMemo start", reports.length);
        if (!reports.length) return {
            chartData: [], portAnalysis: null, stbdAnalysis: null,
            portPrediction: null, stbdPrediction: null, baselinePort: 0, baselineStbd: 0,
            currentDevPort: 0, currentDevStbd: 0,
            currentMjPort: 0, currentMjStbd: 0,
            ladenCount: 0, ballastCount: 0
        };

        const processed: MEDataPoint[] = [];

        // Temporary storage for previous values to calculate diffs
        let prevR133_1 = 0;
        let prevR133_2 = 0;
        let prevTimestamp = 0;

        reports.forEach((r, idx) => {
            const dateStr = r.tasks?.['T04']
                ? r.tasks['T04'].split(' ')[0]
                : (r.submittedAt ? format(parseISO(r.submittedAt), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
            const timestamp = new Date(dateStr).getTime();

            // Derive RPM from R133 (Total Revs) and R067 (Running Hours this report)
            const r133_1 = parseVal(r.items['R133_1']);
            const r133_2 = parseVal(r.items['R133_2']);
            const r067_1 = parseVal(r.items['RH_R067_E01_1']);
            const r067_2 = parseVal(r.items['RH_R067_E01_2']);

            let derivedRpmPort = 0;
            let derivedRpmStbd = 0;

            // Calculate time difference in hours from previous report
            const timeDiffHours = prevTimestamp > 0 ? (timestamp - prevTimestamp) / (1000 * 60 * 60) : 0;

            // Strategy: (CurrentRevs - PrevRevs) / (RunningHours * 60)
            // Invalid if time gap is too large (e.g. > 30 hours) implying missing reports intermediate
            const isGapTooLarge = timeDiffHours > 30;

            if (idx > 0 && r067_1 > 0 && prevR133_1 > 0 && r133_1 > prevR133_1 && !isGapTooLarge) {
                derivedRpmPort = (r133_1 - prevR133_1) / (r067_1 * 60);
            }
            if (idx > 0 && r067_2 > 0 && prevR133_2 > 0 && r133_2 > prevR133_2 && !isGapTooLarge) {
                derivedRpmStbd = (r133_2 - prevR133_2) / (r067_2 * 60);
            }

            prevR133_1 = r133_1 > 0 ? r133_1 : prevR133_1;
            prevR133_2 = r133_2 > 0 ? r133_2 : prevR133_2;
            prevTimestamp = timestamp;

            // Extract Speed (R026)
            const speed = parseVal(r.items['R026']);

            // Extract Power (HP) - R078 (checking e-code map)
            const hpPort = parseVal(r.items['RH_R078_E01_1']);
            const hpStbd = parseVal(r.items['RH_R078_E01_2']);

            // PRIORITIZE Derived RPM if available (since R074 seems missing/zero)
            // Fallback to R074 (Try Per-Engine Keys first, then Single Common Key)
            const commonR074 = parseVal(r.items['R074']);

            // Calculate a unified Derived RPM (Average of Port/Stbd) to ensure identical display
            let unifiedDerivedRpm = 0;
            if (derivedRpmPort > 0 && derivedRpmStbd > 0) {
                unifiedDerivedRpm = (derivedRpmPort + derivedRpmStbd) / 2;
            } else {
                unifiedDerivedRpm = derivedRpmPort || derivedRpmStbd;
            }

            // Logic:
            // 1. If Common R074 exists > 0, use it (User Request: "Use R074 in common").
            // 2. Else if Unified Derived RPM > 0, use it.
            // 3. Fallback to individual per-engine R074 if specific keys exist (unlikely if we want common).

            let finalRpm = 0;
            if (commonR074 > 0) {
                finalRpm = commonR074;
            } else if (unifiedDerivedRpm > 0) {
                finalRpm = unifiedDerivedRpm;
            } else {
                // Last resort: Per-engine raw (might differ, but better than 0)
                finalRpm = parseVal(r.items['RH_R074_E01_1']) || parseVal(r.items['R074_E01_1']) || 0;
            }

            const rpmPort = finalRpm;
            const rpmStbd = finalRpm;


            const voyage = r.items['R005'] ? String(r.items['R005']) : '';
            const isLaden = voyage.trim().toUpperCase().endsWith('L');

            // --- Specific Energy Calculation (MJ/HP-hr) ---
            const activeShip = ships.find(s => s.code === selectedShipCode);
            const configShip = activeShip?.configSourceShipId ? ships.find(s => s.code === activeShip.configSourceShipId) : activeShip;

            let mjPerHpPort = 0;
            let mjPerHpStbd = 0;

            if (configShip && configShip.fuels && codes) {
                let energyPort = 0;
                let energyStbd = 0;

                configShip.fuels.forEach(fuel => {
                    const fDef = codes.fCodes.find(f => f.code === fuel.code);
                    const lcv = (activeShip?.fuels?.find(f => f.code === fuel.code)?.lcv) || fuel.lcv || fDef?.lcv || 0.0405;

                    let factor = 1;
                    if (lcv < 0.1) factor = 1_000_000;
                    else if (lcv >= 0.1 && lcv < 100) factor = 1000;
                    else if (lcv >= 2000 && lcv < 30000) factor = 4.184;

                    const consPort = parseVal(r.items[`CONS_E01_1_${fuel.code}`]);
                    const consStbd = parseVal(r.items[`CONS_E01_2_${fuel.code}`]);

                    energyPort += consPort * lcv * factor;
                    energyStbd += consStbd * lcv * factor;
                });

                if (hpPort > 0 && r067_1 > 0) mjPerHpPort = energyPort / (hpPort * r067_1);
                if (hpStbd > 0 && r067_2 > 0) mjPerHpStbd = energyStbd / (hpStbd * r067_2);
            }

            // Only add if we have some valid data
            processed.push({
                date: dateStr,
                timestamp,
                speed,
                rpmPort,
                hpPort,
                rpmStbd,
                hpStbd,
                totalHp: hpPort + hpStbd,
                isLaden,
                voyage,
                mjPerHpPort,
                mjPerHpStbd
            });
        });

        // Calculate Counts
        const ladenCount = processed.filter(p => p.isLaden).length;
        const ballastCount = processed.filter(p => !p.isLaden).length;

        // Filter Processed Data by Condition (Laden / Ballast)
        const conditionFiltered = processed.filter(p => condition === 'laden' ? p.isLaden : !p.isLaden);

        // Calculate Moving Averages on FILTERED data
        const maHpPort = calculateMA(conditionFiltered.map(p => p.hpPort), maWindow);
        const maRpmPort = calculateMA(conditionFiltered.map(p => p.rpmPort), maWindow);
        const maHpStbd = calculateMA(conditionFiltered.map(p => p.hpStbd), maWindow);
        const maRpmStbd = calculateMA(conditionFiltered.map(p => p.rpmStbd), maWindow);

        const processedWithMA = conditionFiltered.map((p, i) => ({
            ...p,
            maHpPort: maHpPort[i],
            maRpmPort: maRpmPort[i],
            maHpStbd: maHpStbd[i],
            maRpmStbd: maRpmStbd[i]
        }));

        // --- PERIOD ANALYSIS (Moved UP for dependency) ---
        const filterDataByPeriod = (data: typeof processedWithMA) => {
            return data.filter(d => {
                const date = new Date(d.date);
                const yr = date.getFullYear();
                const m = date.getMonth() + 1; // 1-12

                if (yr !== selectedYear) return false;

                if (periodType === 'year') return true;
                if (periodType === 'half') return periodValue === 1 ? m <= 6 : m > 6;
                if (periodType === 'quarter') {
                    if (periodValue === 1) return m >= 1 && m <= 3;
                    if (periodValue === 2) return m >= 4 && m <= 6;
                    if (periodValue === 3) return m >= 7 && m <= 9;
                    if (periodValue === 4) return m >= 10 && m <= 12;
                }
                if (periodType === 'month') return m === periodValue;
                return true;
            });
        };

        const filteredData = filterDataByPeriod(processedWithMA);

        // --- PREDICTION MODEL (DEVIATION BASED) ---
        // 1. Calculate Deviation % for every point
        const processedWithDev = processedWithMA.map(p => {
            const refPort = getReferencePower(p.rpmPort, ships.find(s => s.code === selectedShipCode)?.mePerformance || []);
            const refStbd = getReferencePower(p.rpmStbd, ships.find(s => s.code === selectedShipCode)?.mePerformance || []);

            // Avoid division by zero
            const devPort = refPort > 0 ? ((p.hpPort - refPort) / refPort) * 100 : 0;
            const devStbd = refStbd > 0 ? ((p.hpStbd - refStbd) / refStbd) * 100 : 0;

            return { ...p, devPort, devStbd };
        });



        // 2. Regression on Deviation % (Time vs Dev%)
        const performRegression = (data: any[], valueKey: 'devPort' | 'devStbd') => {
            // ... (keep existing regression)
            const n = data.length;
            if (n < 5) return null; // Need enough points for a trend
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
            let count = 0;

            data.forEach(p => {
                if (p.rpmPort > 40 || p.rpmStbd > 40) {
                    const x = p.timestamp;
                    const y = p[valueKey];
                    sumX += x;
                    sumY += y;
                    sumXY += x * y;
                    sumXX += x * x;
                    count++;
                }
            });

            if (count < 2) return null;
            const slope = (count * sumXY - sumX * sumY) / (count * sumXX - sumX * sumX);
            const intercept = (sumY - slope * sumX) / count;
            return { slope, intercept, predict: (x: number) => slope * x + intercept };
        };

        const regPort = performRegression(processedWithDev, 'devPort');
        const regStbd = performRegression(processedWithDev, 'devStbd');

        // 3. Predict when Deviation % = alpha (User Threshold)
        const calcDate = (reg: { slope: number, intercept: number } | null, limit: number) => {
            // Only predict if slope is positive (degrading)
            if (!reg || reg.slope <= 0) return null;
            const targetTime = (limit - reg.intercept) / reg.slope;
            return new Date(targetTime);
        };

        // 4. Current Average Values (Last 5 valid steady-state points)
        const lastPoints = processedWithDev.filter(p => p.rpmPort > 40).slice(-5);
        const currentDevPortVal = lastPoints.length ? lastPoints.reduce((s, p) => s + p.devPort, 0) / lastPoints.length : 0;
        const currentDevStbdVal = lastPoints.length ? lastPoints.reduce((s, p) => s + p.devStbd, 0) / lastPoints.length : 0;

        const currentMjPortVal = lastPoints.length ? lastPoints.reduce((s, p) => s + (p.mjPerHpPort || 0), 0) / lastPoints.length : 0;
        const currentMjStbdVal = lastPoints.length ? lastPoints.reduce((s, p) => s + (p.mjPerHpStbd || 0), 0) / lastPoints.length : 0;

        // Keep baseline for legacy support if needed (or just calculate dummy)
        const bPort = 0;
        const bStbd = 0;

        const meCurve = ships.find(s => s.code === selectedShipCode)?.mePerformance || [];

        const calculateAnalysis = (data: typeof filteredData, rpmKey: 'maRpmPort' | 'maRpmStbd', hpKey: 'maHpPort' | 'maHpStbd') => {
            if (!data.length || !meCurve.length) return null;

            let totalDiff = 0;
            let totalRef = 0;
            let count = 0;

            data.forEach(d => {
                const rpm = d[rpmKey];
                const actualHp = d[hpKey];

                // Only analyze if running (e.g. > 10 RPM)
                if (rpm > 10 && actualHp > 100) {
                    const refHp = getReferencePower(rpm, meCurve);
                    if (refHp > 0) {
                        totalDiff += (actualHp - refHp);
                        totalRef += refHp;
                        count++;
                    }
                }
            });

            const avgDiff = count > 0 ? totalDiff / count : 0;
            const avgRef = count > 0 ? totalRef / count : 0;
            const avgDiffPercent = avgRef > 0 ? (avgDiff / avgRef) * 100 : 0;

            return { avgDiff, avgDiffPercent };
        };

        const portAnalysisCalc = calculateAnalysis(filteredData, 'maRpmPort', 'maHpPort');
        const stbdAnalysisCalc = calculateAnalysis(filteredData, 'maRpmStbd', 'maHpStbd');

        return {
            chartData: processedWithDev,
            portAnalysis: portAnalysisCalc ? { ...portAnalysisCalc, filteredData } : null,
            stbdAnalysis: stbdAnalysisCalc ? { ...stbdAnalysisCalc, filteredData } : null,
            portPrediction: calcDate(regPort, alpha),
            stbdPrediction: calcDate(regStbd, alpha),
            currentDevPort: currentDevPortVal,
            currentDevStbd: currentDevStbdVal,
            currentMjPort: currentMjPortVal,
            currentMjStbd: currentMjStbdVal,
            baselinePort: bPort,
            baselineStbd: bStbd,
            ladenCount,
            ballastCount
        };
    }, [reports, alpha, maWindow, selectedYear, periodType, periodValue, ships, selectedShipCode, condition, codes]);

    // Derived Threshold Lines for Charts
    const portLimitVal = baselinePort * (1 + alpha / 100);
    const stbdLimitVal = baselineStbd * (1 + alpha / 100);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
            <div className="flex justify-between items-center px-1">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <Activity className="text-blue-400" size={32} />
                        M/E Analysis
                    </h1>
                    <p className="text-slate-400 mt-2">
                        Analyze Main Engine performance and trends (Port/Stbd).
                    </p>
                </div>
                <div className="flex bg-ocean-800 p-2 rounded-xl border border-ocean-700 gap-2">
                    {/* Condition Select (Laden/Ballast) */}
                    <select
                        value={condition}
                        onChange={(e) => setCondition(e.target.value as 'laden' | 'ballast')}
                        className={cn(
                            "bg-ocean-900 border border-ocean-600 rounded-lg px-3 py-2 text-sm font-bold min-w-[140px]",
                            condition === 'laden' ? "text-pink-400 border-pink-500/50" : "text-cyan-400 border-cyan-500/50"
                        )}
                    >
                        <option value="laden">Laden ({ladenCount || 0})</option>
                        <option value="ballast">Ballast ({ballastCount || 0})</option>
                    </select>

                    {/* Year Select */}
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="bg-ocean-900 border border-ocean-600 rounded-lg px-3 py-2 text-white text-sm font-bold"
                    >
                        {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>

                    {/* Type Select */}
                    <select
                        value={periodType}
                        onChange={(e) => {
                            setPeriodType(e.target.value as any);
                            setPeriodValue(1); // Reset value when type changes
                        }}
                        className="bg-ocean-900 border border-ocean-600 rounded-lg px-3 py-2 text-white text-sm font-bold"
                    >
                        <option value="year">Year</option>
                        <option value="half">Half Year</option>
                        <option value="quarter">Quarter</option>
                        <option value="month">Month</option>
                    </select>

                    {/* Value Select (Conditional) */}
                    {periodType !== 'year' && (
                        <select
                            value={periodValue}
                            onChange={(e) => setPeriodValue(parseInt(e.target.value))}
                            className="bg-ocean-900 border border-ocean-600 rounded-lg px-3 py-2 text-white text-sm font-bold"
                        >
                            {periodType === 'half' && [1, 2].map(v => <option key={v} value={v}>{v === 1 ? '1st Half' : '2nd Half'}</option>)}
                            {periodType === 'quarter' && [1, 2, 3, 4].map(v => <option key={v} value={v}>Q{v}</option>)}
                            {periodType === 'month' && Array.from({ length: 12 }, (_, i) => i + 1).map(v => <option key={v} value={v}>{format(new Date(2024, v - 1, 1), 'MMM')}</option>)}
                        </select>
                    )}
                </div>
            </div>

            {/* Controls & Prediction Widget */}
            <div className="bg-ocean-800 rounded-2xl p-6 border border-ocean-700 shadow-xl relative z-20">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Ship & Alpha Control */}
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                <ShipIcon size={14} /> Vessel
                            </label>
                            <select
                                className="w-full bg-ocean-900 border border-ocean-600 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium appearance-none"
                                value={selectedShipCode}
                                onChange={(e) => setSelectedShipCode(e.target.value)}
                            >
                                <option value="">Select Vessel...</option>
                                {ships.map(s => (
                                    <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-3 pt-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Power Threshold (α)
                                </label>
                                <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-sm font-bold border border-blue-500/30">
                                    {alpha.toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                        value={tempAlpha}
                                        onChange={(e) => setTempAlpha(parseFloat(e.target.value))}
                                        className="bg-ocean-900 border border-ocean-600 rounded-lg pl-3 pr-8 py-2 text-white text-sm font-bold w-28 placeholder-slate-600"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">%</span>
                                </div>
                                <button
                                    onClick={() => setAlpha(tempAlpha)}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-blue-500/20"
                                >
                                    Calculate
                                </button>
                            </div>
                        </div>

                        {/* MA Window Selection */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                <Calendar size={14} /> Moving Average
                            </label>
                            <div className="flex bg-ocean-900 p-1 rounded-xl border border-ocean-600">
                                {[5, 10, 15, 20].map(w => (
                                    <button
                                        key={w}
                                        onClick={() => setMaWindow(w)}
                                        className={cn(
                                            "flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-200",
                                            maWindow === w
                                                ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                                                : "text-slate-400 hover:text-blue-300 hover:bg-ocean-800"
                                        )}
                                    >
                                        {w}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Prediction Display */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <PredictionCard
                            title="PORT Engine Specific Energy"
                            date={portPrediction}
                            currentValue={currentMjPort || 0}
                            limitValue={0} // MJ/HP limit not defined yet, showing absolute
                            unit="MJ/HP-hr"
                            color="text-red-400"
                            borderColor="border-red-500/30"
                        />
                        <PredictionCard
                            title="STBD Engine Specific Energy"
                            date={stbdPrediction}
                            currentValue={currentMjStbd || 0}
                            limitValue={0}
                            unit="MJ/HP-hr"
                            color="text-orange-400"
                            borderColor="border-orange-500/30"
                        />
                    </div>
                </div>
            </div>

            {/* Graphs Row 1: Engines & Performance Curve */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column: Port/Stbd Analysis (2/3 Width) */}
                <div className="lg:col-span-2 space-y-6">
                    <EngineChart
                        title={`PORT Engine Analysis (${maWindow}-Point MA)`}
                        data={chartData}
                        rpmKey="maRpmPort"
                        hpKey="maHpPort"
                        limitVal={portLimitVal}
                        rpmColor="#4ade80" // Green
                        hpColor="#f87171" // Red
                    />
                    <EngineChart
                        title={`STBD Engine Analysis (${maWindow}-Point MA)`}
                        data={chartData}
                        rpmKey="maRpmStbd"
                        hpKey="maHpStbd"
                        limitVal={stbdLimitVal}
                        rpmColor="#60a5fa" // Blue
                        hpColor="#fb923c" // Orange
                    />
                </div>

                {/* Right Column: Performance Curve (1/3 Width) - Split Top/Bottom for Port/Stbd */}
                <div className="lg:col-span-1 space-y-6">
                    <PerformanceCurveChart
                        title="PORT M/E Performance"
                        referenceData={ships.find(s => s.code === selectedShipCode)?.mePerformance || []}
                        actualData={portAnalysis?.filteredData?.map((d: any) => ({ rpm: d.maRpmPort, power: d.maHpPort, date: d.date })) || []}
                        color="#4ade80" // Green
                        analysis={portAnalysis || undefined}
                    />
                    <PerformanceCurveChart
                        title="STBD M/E Performance"
                        referenceData={ships.find(s => s.code === selectedShipCode)?.mePerformance || []}
                        actualData={stbdAnalysis?.filteredData?.map((d: any) => ({ rpm: d.maRpmStbd, power: d.maHpStbd, date: d.date })) || []}
                        color="#60a5fa" // Blue
                        analysis={stbdAnalysis || undefined}
                    />
                </div>
            </div>


            {/* Graphs Row 3: Speed vs Total HP */}
            < div className="bg-ocean-800 rounded-2xl p-6 border border-ocean-700 shadow-xl min-h-[400px]" >
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <Activity size={20} className="text-purple-400" />
                    Speed vs Power
                </h3>
                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis
                                dataKey="date"
                                stroke="#94a3b8"
                                tick={{ fontSize: 12 }}
                            />
                            <YAxis
                                yAxisId="left"
                                stroke="#c084fc"
                                label={{ value: 'Speed (kts)', angle: -90, position: 'insideLeft', fill: '#c084fc' }}
                                domain={['auto', 'auto']}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="#cbd5e1"
                                label={{ value: 'Power (HP)', angle: 90, position: 'insideRight', fill: '#cbd5e1' }}
                                domain={['auto', 'auto']}
                            />
                            <Tooltip content={<CustomTooltipSpeed />} />
                            <Legend />
                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="speed"
                                name="Speed (kts)"
                                stroke="#c084fc"
                                strokeWidth={2}
                                dot={{ r: 3 }}
                            />
                            {/* Port HP */}
                            <Line
                                yAxisId="right"
                                type="monotone"
                                name="Port HP"
                                dataKey="hpPort"
                                stroke="#f87171" // Red
                                strokeWidth={2}
                                dot={{ r: 3 }}
                            />
                            {/* Stbd HP */}
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="hpStbd"
                                name="Stbd HP"
                                stroke="#fb923c" // Orange
                                strokeWidth={2}
                                dot={{ r: 3 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Graphs Row 4: RPM vs Speed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RpmSpeedCurveChart ship={ships.find(s => s.code === selectedShipCode)} actualData={chartData.filter(d => d.isLaden)} mode="laden" />
                <RpmSpeedCurveChart ship={ships.find(s => s.code === selectedShipCode)} actualData={chartData.filter(d => !d.isLaden)} mode="ballast" />
            </div>
        </div>
    );
};

// --- Sub Components ---

const PredictionCard = ({ title, date, currentValue, limitValue, unit, color, borderColor }: any) => {

    return (
        <div className={`bg-ocean-900/50 rounded-xl p-4 border ${borderColor} relative overflow-hidden`}>
            {/* Background Accent */}
            <div className={`absolute top-0 right-0 w-24 h-24 bg-current opacity-5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none ${color}`}></div>

            <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{title}</h4>

            <div className="flex items-end gap-3 mb-2">
                <div className={`text-2xl font-bold ${color}`}>
                    {date ? format(date, 'yyyy-MM-dd') : 'No Trend'}
                </div>
                {date && (
                    <div className="text-slate-500 text-xs mb-1 font-mono">
                        ({differenceInDays(date, new Date())} days left)
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center text-xs border-t border-white/5 pt-2 mt-2">
                <span className="text-slate-500">Current: <span className="text-white font-mono">{currentValue.toFixed(4)} <span className="text-[10px] opacity-70">{unit}</span></span></span>
                {limitValue > 0 && <span className="text-slate-500">Limit: <span className={`${color} font-mono font-bold`}>{limitValue.toFixed(2)}</span></span>}
            </div>

            {/* Warning if close/past */}
            {date && differenceInDays(date, new Date()) < 30 && (
                <div className="absolute top-3 right-3 animate-pulse text-red-500">
                    <AlertTriangle size={16} />
                </div>
            )}
        </div>
    );
};

const EngineChart = ({ title, data, rpmKey, hpKey, limitVal, rpmColor, hpColor }: any) => {
    return (
        <div className="bg-ocean-800 rounded-2xl p-6 border border-ocean-700 shadow-xl min-h-[400px]">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Activity size={18} className="text-slate-400" />
                {title}
            </h3>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis
                            yAxisId="left"
                            stroke={rpmColor}
                            label={{ value: 'RPM', angle: -90, position: 'insideLeft', fill: rpmColor, fontSize: 10 }}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            stroke={hpColor}
                            label={{ value: 'HP', angle: 90, position: 'insideRight', fill: hpColor, fontSize: 10 }}
                        />
                        <Tooltip content={<CustomTooltipEngine />} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />

                        {/* RPM Line */}
                        <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey={rpmKey}
                            name="RPM"
                            stroke={rpmColor}
                            strokeWidth={2}
                            dot={false}
                        />

                        {/* HP Line */}
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey={hpKey}
                            name="Power (HP)"
                            stroke={hpColor}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                        />

                        {/* Limit Line */}
                        <ReferenceLine
                            yAxisId="right"
                            y={limitVal}
                            stroke="#ef4444"
                            strokeDasharray="3 3"
                            label={{ value: 'Limit', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

// Custom Tooltips
const CustomTooltipEngine = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs z-50">
            <div className="font-bold text-white mb-2">{label}</div>
            {payload.map((p: any) => (
                <div key={p.name} className="flex items-center gap-2 mb-1" style={{ color: p.color }}>
                    <span className="font-medium">{p.name}:</span>
                    <span className="font-mono">{Number(p.value).toFixed(1)}</span>
                </div>
            ))}
        </div>
    );
};

const CustomTooltipSpeed = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs z-50">
            <div className="font-bold text-white mb-2">{label}</div>
            <div className="space-y-1">
                <div className="text-purple-400 flex justify-between gap-4">
                    <span>Speed:</span>
                    <span className="font-mono">{Number(payload[0]?.value).toFixed(1)} kts</span>
                </div>
                <div className="text-slate-300 flex justify-between gap-4">
                    <span>Total HP:</span>
                    <span className="font-mono">{Number(payload[1]?.value).toFixed(1)} HP</span>
                </div>
            </div>
        </div>
    );
};

const PerformanceCurveChart = ({ title, referenceData, actualData, color, analysis }: { title: string, referenceData: any[], actualData: any[], color: string, analysis?: { avgDiff: number, avgDiffPercent: number, filteredData: any[] } | null }) => {
    // Sort reference data by RPM for the line (use memo if needed, but low count)
    const sortedRef = [...(referenceData || [])].sort((a, b) => a.rpm - b.rpm);

    return (
        <div className="bg-ocean-800 rounded-2xl p-6 border border-ocean-700 shadow-xl h-[400px] relative">
            {/* Analysis Overlay */}
            {analysis && analysis.avgDiff !== 0 && (
                <div className="absolute top-6 right-6 z-10 bg-slate-900/90 border border-slate-700 p-3 rounded-xl shadow-lg backdrop-blur-sm">
                    <div className="text-xs text-slate-400 mb-1 uppercase font-bold tracking-wider">Perf. Deviation</div>
                    <div className={cn("text-xl font-mono font-bold flex items-center gap-2", analysis.avgDiff > 0 ? "text-red-400" : "text-emerald-400")}>
                        {analysis.avgDiff > 0 ? '+' : ''}{analysis.avgDiff.toFixed(1)} <span className="text-xs text-slate-500">KW</span>
                        <span className="text-sm ml-1 opacity-80">({analysis.avgDiff > 0 ? '+' : ''}{analysis.avgDiffPercent.toFixed(1)}%)</span>
                    </div>
                </div>
            )}

            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Activity size={18} className={cn("opacity-80", `text-[${color}]`)} style={{ color: color }} />
                {title}
            </h3>
            <div className="h-[calc(100%-2rem)] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                            dataKey="rpm"
                            type="number"
                            stroke="#94a3b8"
                            tick={{ fontSize: 11 }}
                            label={{ value: 'RPM', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 10 }}
                            domain={['auto', 'auto']}
                        />
                        <YAxis
                            dataKey="power"
                            type="number"
                            stroke="#cbd5e1"
                            label={{ value: 'Power (KW)', angle: -90, position: 'insideLeft', fill: '#cbd5e1', fontSize: 10 }}
                            domain={['auto', 'auto']}
                        />
                        <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    const isRef = !data.date;
                                    return (
                                        <div className="bg-slate-900 border border-slate-700 p-2 rounded shadow-xl text-xs">
                                            <div className="font-bold text-white mb-1">{isRef ? 'Reference Curve' : data.date}</div>
                                            <div>RPM: {Number(data.rpm).toFixed(1)}</div>
                                            <div>Power: {Number(data.power).toFixed(1)} KW</div>
                                        </div>
                                    )
                                }
                                return null;
                            }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />

                        {/* Reference Curve */}
                        <Line
                            data={sortedRef}
                            type="monotone"
                            dataKey="power"
                            name="Ref. Curve"
                            stroke="#c084fc"
                            strokeWidth={2}
                            dot={false}
                            activeDot={false}
                        />

                        {/* Actual Operation Points */}
                        <Scatter
                            data={actualData}
                            name="Actual"
                            fill={color}
                            shape="circle"
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};



const RpmSpeedCurveChart = ({ ship, actualData, mode }: { ship?: Ship, actualData: any[], mode: 'laden' | 'ballast' }) => {
    const refData = ship?.meRpmSpeedConfig?.find(p => p.mode === mode)?.data || [];

    const sortedRef = [...refData].sort((a, b) => a.rpm - b.rpm).map(d => ({ rpm: d.rpm, speed: d.speed, type: `${mode === 'laden' ? 'Laden' : 'Ballast'} Ref.` }));

    const actual = actualData.map(d => ({ rpm: d.rpmPort, speed: d.speed, date: d.date, type: 'Actual' }));
    const color = mode === 'laden' ? '#f472b6' : '#22d3ee';

    return (
        <div className="bg-ocean-800 rounded-2xl p-6 border border-ocean-700 shadow-xl min-h-[400px] mt-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Gauge size={20} className={mode === 'laden' ? 'text-pink-400' : 'text-cyan-400'} />
                M/E RPM vs Speed ({mode.toUpperCase()})
            </h3>
            <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                            dataKey="rpm"
                            type="number"
                            name="RPM"
                            stroke="#94a3b8"
                            domain={['dataMin - 2', 'dataMax + 2']}
                            label={{ value: 'RPM', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 12 }}
                            tick={{ fontSize: 12 }}
                        />
                        <YAxis
                            dataKey="speed"
                            type="number"
                            name="Speed"
                            stroke="#10b981"
                            domain={['dataMin - 1', 'dataMax + 1']}
                            label={{ value: 'Speed (kts)', angle: -90, position: 'insideLeft', fill: '#10b981', fontSize: 12 }}
                            tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs z-50">
                                            <div className="font-bold text-white mb-2" style={{ color: payload[0].color }}>
                                                {data.date ? `Actual: ${data.date}` : data.type}
                                            </div>
                                            <div className="flex justify-between gap-4 mb-1">
                                                <span className="text-slate-400">RPM:</span>
                                                <span className="font-mono text-white">{Number(data.rpm).toFixed(1)}</span>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <span className="text-slate-400">Speed:</span>
                                                <span className="font-mono text-white">{Number(data.speed).toFixed(1)} kts</span>
                                            </div>
                                        </div>
                                    )
                                }
                                return null;
                            }}
                        />
                        <Legend />

                        {/* Reference Curve */}
                        {sortedRef.length > 0 && <Scatter name={`${mode === 'laden' ? 'Laden' : 'Ballast'} Ref.`} data={sortedRef} fill={color} line={{ stroke: color, strokeWidth: 2 }} shape="circle" />}

                        {/* Actual Points */}
                        {actual.length > 0 && <Scatter name={`Actual (${mode === 'laden' ? 'Laden' : 'Ballast'})`} data={actual} fill="#eab308" shape="diamond" />}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default MEAnalysis;
