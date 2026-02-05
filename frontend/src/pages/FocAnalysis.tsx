import { useState, useEffect, useMemo } from 'react';
import { Activity, Ship as ShipIcon, Droplet, Zap, AlertCircle, History, Map as MapIcon, Fuel, Calendar, ArrowUp, ArrowDown, Printer } from 'lucide-react';
import { fetchShips } from '../api/ships';
import { fetchReports } from '../api/reports';
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

const FocAnalysis = () => {
    // ... (lines 19-210)

    <Tooltip
        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
        itemStyle={{ color: '#f8fafc' }}
        formatter={(value: any, name: any) => {
            if (name === 'focRange') return [`${value[0].toFixed(2)} - ${value[1].toFixed(2)}`, 'Tolerance Range'];
            return [Number(value).toFixed(2), name === 'foc' ? 'Daily FOC' : name];
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
    const activeReports = useMemo(() => {
        const ship = ships.find(s => s.code === selectedShipCode);
        if (!ship) return [];
        return reports
            .filter(r => r.items['R001'] === ship.name)
            .sort((a, b) => {
                const tA = new Date(a.items['R003'] as string || a.submittedAt || 0).getTime();
                const tB = new Date(b.items['R003'] as string || b.submittedAt || 0).getTime();
                return tB - tA;
            });
    }, [ships, selectedShipCode, reports]);

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
    useEffect(() => {
        setSelectedVoyage('');
        setSelectedReportId('');
    }, [selectedShipCode]);


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
                        val += parseFloat(selectedReport.items[k] as string) || 0;
                    }
                });
            }

            // Normalize Value and Energy
            const normalizedVal = val * normalizationFactor;
            const energy = normalizedVal * lcv * factor;

            return { name, val: normalizedVal, rawVal: val, energy };
        }).filter(f => f.energy > 0 || f.val > 0) || [];
    }, [ships, selectedShipCode, selectedReport, codes]);

    // Calculate Equipment Metrics (Normalized)
    const equipmentMetrics = useMemo(() => {
        if (!selectedReport || !codes?.eCodes || !selectedShip) return [];

        // Operation Time (Reusable)
        const opTimeStr = selectedReport.items['R200'] as string || selectedReport.items['R011'] as string;
        const opTime = parseFloat(opTimeStr) || 24;
        const normalizationFactor = opTime > 0 ? (24 / opTime) : 1;

        const eqMap = new Map<string, { name: string, val: number, energy: number, fuels: Map<string, { val: number, name: string }> }>();

        Object.entries(selectedReport.items).forEach(([key, value]) => {
            if (!key.startsWith('CONS_')) return;
            const parts = key.split('_');
            if (parts.length < 4) return;

            const fuelCode = parts[parts.length - 1];
            const eqCode = parts[1];

            const rawVal = parseFloat(value as string) || 0;
            if (rawVal === 0) return;

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
                eqMap.set(eqCode, { name: eqName, val: 0, energy: 0, fuels: new Map() });
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

    const currentSpeed = useMemo(() => {
        if (!selectedReport) return 0;
        return parseFloat(selectedReport.items['R026'] as string || selectedReport.items['R034'] as string || selectedReport.items['R077'] as string || '0');
    }, [selectedReport]);

    const availableProfiles = useMemo(() => {
        if (!selectedShip?.focManagement) return [];
        return selectedShip.focManagement.filter(p => p.mode === focMode);
    }, [selectedShip, focMode]);

    // Auto-select first profile when list changes
    useEffect(() => {
        if (availableProfiles.length > 0) {
            // Try to keep selection if valid, else pick first
            const exists = availableProfiles.find(p => p.type === selectedType);
            if (!exists) {
                setSelectedType(availableProfiles[0].type);
            }
        } else {
            setSelectedType('');
        }
    }, [availableProfiles, selectedType]);

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

    // Helper to calculate total normalized energy for any report
    const getNormalizedEnergy = (r: Report) => {
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

            if (val === 0) {
                Object.keys(r.items).forEach(k => {
                    if (k.startsWith('CONS_') && k.endsWith(`_${fuel.code}`)) {
                        val += parseFloat(r.items[k] as string) || 0;
                    }
                });
            }

            totalE += (val * normFactor * rawLcv * factor);
        });

        return totalE;
    };

    // Helper to interpolate expected FOC from curve for any speed (TJ/24h)
    const calculateExpectedCurveFoc = (speed: number) => {
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
    };

    const voyageStats = useMemo(() => {
        if (!displayedReports.length || chartData.length === 0) return null;

        let totalActualTJ = 0;
        let totalExpectedTJ = 0;
        let totalExcessTJ = 0;

        displayedReports.forEach(r => {
            // Only consider sea-going/noon reports for fair comparison if needed, 
            // or all reports where speed > 0
            const speed = parseFloat(r.items['R026'] as string || r.items['R034'] as string || '0');
            if (speed <= 0) return;

            const opTimeStr = r.items['R200'] as string || r.items['R011'] as string;
            const opTime = parseFloat(opTimeStr) || 24;

            // getNormalizedEnergy returns TJ normalized to 24h * 1M (MJ) -> No, check getNormalizedEnergy
            // getNormalizedEnergy returns MJ normalized to 24h

            // Actual TJ for this report's duration
            // Normalized (MJ/24h) -> Actual (MJ) = Normalized * (opTime/24)
            const normMJ = getNormalizedEnergy(r);
            const actualMJ = normMJ * (opTime / 24);

            // Expected TJ for this report's duration
            // Curve provides TJ/24h
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

        // For Standard: diffTJ can be negative (Savings) or positive (Excess)
        // For Correction: diffTJ is always positive (Total Penalty) or 0

        // Remove 'const diffTJ = ...' as it is now calculated above
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

    }, [displayedReports, chartData, getNormalizedEnergy, lngPrice, lsmgoPrice, analysisMode]);

    const voyageNoonData = useMemo(() => {
        if (!displayedReports.length) return [];
        return displayedReports
            .filter(r => {
                const evName = (codes?.evCodes.find(e => e.code === r.evCode)?.name || '').toLowerCase();
                const r004 = (r.items['R004'] as string || '').toLowerCase();
                // Filter for Noon Reports
                return r.evCode === 'N' || evName.includes('noon') || r004.includes('noon');
            })
            .map(r => {
                let dateStr = r.items['R003'] as string || r.submittedAt;
                // Handle Excel Serial Date (e.g., 45805.5) which is number of days since 1900-01-01
                if (dateStr && !isNaN(Number(dateStr)) && !dateStr.includes('-')) {
                    const serial = Number(dateStr);
                    // Excel base date (Dec 30 1899) to Unix epoch (Jan 1 1970) is 25569 days
                    const dateObj = new Date(Math.round((serial - 25569) * 86400 * 1000));
                    dateStr = dateObj.toISOString().split('T')[0];
                } else if (dateStr) {
                    dateStr = dateStr.split('T')[0];
                }

                return {
                    speed: parseFloat(r.items['R026'] as string || r.items['R034'] as string || '0'),
                    foc: getNormalizedEnergy(r) / 1_000_000, // Convert MJ to TJ
                    date: dateStr,
                    name: r.items['R004'] as string || 'Noon Report'
                };
            })
            .filter(d => d.speed > 0 && d.foc > 0);
    }, [displayedReports, selectedShip, codes, ships]);

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
                                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis
                                        dataKey="speed"
                                        type="number"
                                        domain={['auto', 'auto']}
                                        allowDataOverflow={false}
                                        tick={{ fill: '#94a3b8' }}
                                        label={{ value: 'Speed (kts)', position: 'insideBottom', offset: -10, fill: '#cbd5e1' }}
                                    />
                                    <YAxis
                                        dataKey="foc"
                                        tick={{ fill: '#94a3b8' }}
                                        label={{ value: 'Daily FOC (TJ)', angle: -90, position: 'insideLeft', offset: 0, fill: '#cbd5e1' }}
                                        domain={['auto', 'auto']}
                                    />
                                    <Tooltip
                                        shared={false}
                                        cursor={{ strokeDasharray: '3 3' }}
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                                        itemStyle={{ color: '#f8fafc' }}
                                        formatter={(value: any, name: any, props: any) => {
                                            if (name === 'focRange') return [`${value[0].toFixed(2)} - ${value[1].toFixed(2)}`, 'Tolerance Range'];

                                            // Show date for Noon Reports
                                            if (props && props.payload && props.payload.date) {
                                                return [Number(value).toFixed(2), `Daily FOC (${props.payload.date})`];
                                            }

                                            return [Number(value).toFixed(2), name === 'foc' ? 'Daily FOC' : name];
                                        }}
                                        labelFormatter={(label) => `Speed: ${label} kts`}
                                    />

                                    {/* Tolerance Band Area */}
                                    <Area
                                        type="monotone"
                                        data={chartData}
                                        dataKey="focRange"
                                        stroke="none"
                                        fill="#ef4444"
                                        fillOpacity={0.2}
                                        name="Tolerance (+/- 5%)"
                                    />

                                    {/* Main Line */}
                                    <Line
                                        type="monotone"
                                        data={chartData}
                                        dataKey="foc"
                                        stroke="#3b82f6"
                                        strokeWidth={3}
                                        dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                                        activeDot={{ r: 6, fill: '#cbd5e1' }}
                                        name="Standard FOC"
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
                                        data={voyageNoonData}
                                        fill="#fdba74"
                                        line={false}
                                        shape="circle"
                                        name="Voyage Noon Reports"
                                    >
                                        {voyageNoonData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill="#fdba74" />
                                        ))}
                                    </Scatter>
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
                                        const noonTime = r.tasks?.['T04'];
                                        const date = noonTime || (r.items['R003'] as string) || r.submittedAt;
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

                        {selectedReport && (
                            <>
                                <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-4">
                                    <h3 className="text-indigo-300 font-bold mb-2 flex items-center gap-2">
                                        <Zap size={16} /> Total Energy
                                    </h3>
                                    <div className="text-3xl font-bold text-white tracking-tight">
                                        {(totalEnergy / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-lg text-slate-400 font-normal">GJ</span>
                                    </div>
                                    <div className="text-xs text-indigo-400/70 mt-1">
                                        Aggregated from {fuelMetrics.length} fuel sources
                                    </div>
                                </div>

                                <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
                                    <h3 className="text-emerald-300 font-bold mb-2 flex items-center gap-2">
                                        <Activity size={16} /> Speed
                                    </h3>
                                    <div className="text-3xl font-bold text-white tracking-tight">
                                        {currentSpeed.toFixed(1)} <span className="text-lg text-slate-400 font-normal">kts</span>
                                    </div>
                                    <div className="text-xs text-emerald-400/70 mt-1">
                                        {selectedReport.items['R004'] as string || 'Noon Report'}
                                    </div>
                                </div>

                                <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                                    <h3 className="text-blue-300 font-bold mb-2 flex items-center gap-2">
                                        <History size={16} /> Operation Time
                                    </h3>
                                    <div className="text-3xl font-bold text-white tracking-tight">
                                        {parseFloat(selectedReport.items['R200'] as string || selectedReport.items['R011'] as string || '24').toFixed(2)}
                                    </div>
                                    <div className="text-xs text-blue-400/70 mt-1">
                                        Hours (Normalized to 24h)
                                    </div>
                                </div>


                            </>
                        )}
                    </div>

                    {/* Breakdown Side */}
                    <div className="lg:col-span-8">
                        {renderMetricsContent(fuelMetrics.length > 0, fuelMetrics, equipmentMetrics)}
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
const renderMetricsContent = (hasData: boolean, fuelMetrics: any[], equipmentMetrics: any[] = []) => {
    if (!hasData) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-ocean-700/50 rounded-xl p-8">
                <Fuel size={48} className="mb-4 opacity-50" />
                <p>Select a report to view energy analysis</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-ocean-900/30 rounded-xl border border-ocean-700/50 p-4">
                    <h4 className="text-sm font-bold text-slate-300 mb-4 text-center">Fuel Consumption Breakdown</h4>
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
                        {equipmentMetrics.map((eq, i) => (
                            <div key={i} className="bg-ocean-900 p-3 rounded-lg border border-ocean-700">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-bold text-slate-200">{eq.name}</span>
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
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FocAnalysis;
