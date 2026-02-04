import { useState, useEffect, useMemo } from 'react';
import { Activity, Ship as ShipIcon, Droplet, Zap, AlertCircle, History, Map as MapIcon, Fuel, Calendar } from 'lucide-react';
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
    PieChart, Pie, Cell, Legend
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

    // Calculate Fuel Metrics
    const fuelMetrics = useMemo(() => {
        const ship = ships.find(s => s.code === selectedShipCode);
        if (!ship || !selectedReport) return [];

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

            return { name, val, energy: val * lcv * factor };
        }).filter(f => f.energy > 0 || f.val > 0) || [];
    }, [ships, selectedShipCode, selectedReport, codes]);

    // Calculate Equipment Metrics
    const equipmentMetrics = useMemo(() => {
        if (!selectedReport || !codes?.eCodes || !selectedShip) return [];

        const eqMap = new Map<string, { name: string, val: number, energy: number, fuels: Map<string, { val: number, name: string }> }>();

        Object.entries(selectedReport.items).forEach(([key, value]) => {
            if (!key.startsWith('CONS_')) return;
            const parts = key.split('_');
            // Expected format: CONS_{EqCode}_{Unit}_{FuelCode} or CONS_{EqCode}_{Unit}_{FuelCode}_{Index}?
            // Standardizing on: CONS_{EqCode}_{Unit}_{FuelCode}
            // But we need to be careful about splitting.
            // Let's assume standard 4 parts for now, or handle dynamic length.
            // Actually, usually it is CONS_E01_MT_HFO etc.

            // Basic parsing strategy:
            // 1. Prefix 'CONS'
            // 2. EqCode (variable length?)
            // 3. Unit (MT?)
            // 4. FuelCode (Suffix)

            // Better strategy: iterate configShip fuels and check suffix?
            // Or just split.
            if (parts.length < 4) return;

            const fuelCode = parts[parts.length - 1]; // Last part is Fuel Code
            // Unit is likely 2nd to last partial (MT, M3 etc)
            // EqCode is parts[1] ... parts[length-2] joined?
            const eqCode = parts[1]; // Simple assumption for now: E01, E02...

            const val = parseFloat(value as string) || 0;
            if (val === 0) return;

            const eqDef = codes.eCodes.find(e => e.code === eqCode);
            const eqName = eqDef?.name || eqCode;

            // Get Energy Factor for Fuel
            // We need to look up LCV etc for this fuel.
            // We can reuse logic or look up from fuelMetrics if available/simple.
            // Let's re-derive factor quickly to be safe/consistent.

            const configShip = selectedShip.configSourceShipId
                ? ships.find(s => s.code === selectedShip.configSourceShipId) || selectedShip
                : selectedShip;

            const fuel = configShip.fuels?.find(f => f.code === fuelCode);
            const fDef = codes.fCodes?.find(f => f.code === fuelCode);

            // LCV Calculation
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
            /* 
               We store { val, name } in the fuels map. 
               Since fuelCode is the key, we can retrieve/update the value object.
               But map.get returns reference? No, we need to be careful with primitives vs objects.
               Better to check if key exists.
            */
            if (!record.fuels.has(fuelCode)) {
                record.fuels.set(fuelCode, { val: 0, name: fName });
            }
            const fRecord = record.fuels.get(fuelCode)!;
            fRecord.val += val;
            // Ensure name is set if not already (logic above covers init)

        });

        return Array.from(eqMap.values()).sort((a, b) => b.energy - a.energy);
    }, [selectedReport, codes, selectedShip, ships]);

    const totalEnergy = fuelMetrics.reduce((sum, item) => sum + item.energy, 0);

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
            </div>

            {/* Controls */}
            <div className="bg-ocean-800 rounded-2xl p-6 border border-ocean-700 shadow-xl">
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                                    data={chartData}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis
                                        dataKey="speed"
                                        type="number"
                                        domain={['dataMin', 'dataMax']}
                                        ticks={chartData.map(d => d.speed)}
                                        interval={0}
                                        tick={{ fill: '#94a3b8' }}
                                        label={{ value: 'Speed (kts)', position: 'insideBottom', offset: -10, fill: '#cbd5e1' }}
                                    />
                                    <YAxis
                                        tick={{ fill: '#94a3b8' }}
                                        label={{ value: 'Daily FOC (TJ)', angle: -90, position: 'insideLeft', offset: 0, fill: '#cbd5e1' }}
                                        domain={['auto', 'auto']}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                                        itemStyle={{ color: '#f8fafc' }}
                                        formatter={(value: any, name: any) => {
                                            if (name === 'focRange') return [`${value[0].toFixed(2)} - ${value[1].toFixed(2)}`, 'Tolerance Range'];
                                            return [Number(value).toFixed(2), name === 'foc' ? 'Daily FOC' : name];
                                        }}
                                        labelFormatter={(label) => `Speed: ${label} kts`}
                                    />

                                    {/* Tolerance Band Area */}
                                    <Area
                                        type="monotone"
                                        dataKey="focRange"
                                        stroke="none"
                                        fill="#ef4444"
                                        fillOpacity={0.2}
                                        name="Tolerance (+/- 5%)"
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

                        {selectedReport && (
                            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-4">
                                <h3 className="text-indigo-300 font-bold mb-2 flex items-center gap-2">
                                    <Zap size={16} /> Total Energy
                                </h3>
                                <div className="text-3xl font-bold text-white tracking-tight">
                                    {(totalEnergy / 1000).toFixed(1)} <span className="text-lg text-slate-400 font-normal">GJ</span>
                                </div>
                                <div className="text-xs text-indigo-400/70 mt-1">
                                    Aggregated from {fuelMetrics.length} fuel sources
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Breakdown Side */}
                    <div className="lg:col-span-8">
                        {renderMetricsContent(fuelMetrics.length > 0, fuelMetrics, equipmentMetrics)}
                    </div>
                </div>
            </div>

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
                                    formatter={(val: any) => [Number(val).toFixed(1) + ' MT', 'Consumption']}
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
                                <div className="font-bold text-white">{f.val.toFixed(2)} <span className="text-xs text-slate-500">MT</span></div>
                                <div className="text-xs text-emerald-400">{(f.energy / 1000).toFixed(2)} GJ</div>
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
                                        <div className="font-bold text-white">{eq.val.toFixed(2)} <span className="text-xs text-slate-500">MT</span></div>
                                        <div className="text-xs text-emerald-400">{(eq.energy / 1000).toFixed(2)} GJ</div>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    {Array.from(eq.fuels.values()).map((f: any) => (
                                        <div key={f.name} className="flex justify-between text-xs text-slate-400">
                                            <span>{f.name}</span>
                                            <span>{f.val.toFixed(2)} MT</span>
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
