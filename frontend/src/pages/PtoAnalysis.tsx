import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Zap, Activity, Clock, ShieldAlert, AlertCircle, Search, ChevronDown, X } from 'lucide-react';
import axios from 'axios';
import { 
    Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
    ComposedChart, Line, Scatter, ReferenceLine
} from 'recharts';
import { getYear, getMonth } from 'date-fns';
import { cn } from '../utils/cn';

interface PtoProcessedData {
    timestamp: number;
    dateStr: string;
    ptoActive: number;
    esdTrigger: number;
    portMeRpm?: number;
    portMePower?: number;
    stbdMeRpm?: number;
    stbdMePower?: number;
    vesselSpeed?: number;
    ptoPortPower?: number;
    ptoStbdPower?: number;
    dgPower?: number;
}

// Removed FilterMode type

const API_BASE = 'http://localhost:8500/api/pto';

const PtoAnalysis: React.FC = () => {
    const [data, setData] = useState<PtoProcessedData[]>([]);
    const [fuelFactor, setFuelFactor] = useState(0.8);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    // Removed uploadProgress
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [activeSourceName, setActiveSourceName] = useState<string>('No Data Loaded');

    // NEW: Report Selection States
    const [allReports, setAllReports] = useState<any[]>([]);
    const [selectedShip, setSelectedShip] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<string>(''); // e.g., "2025"
    const [selectedVoyage, setSelectedVoyage] = useState<string>('');
    const [selectedMonthStr, setSelectedMonthStr] = useState<string>(''); // e.g., "2026-02"
    const [selectedReportId, setSelectedReportId] = useState<string>('');
    const [zoomedEngine, setZoomedEngine] = useState<'port' | 'stbd' | null>(null);

    // Removed fileInputRef

    // Fetch All Reports for Filtering
    const loadReports = useCallback(async () => {
        try {
            const response = await axios.get('http://localhost:8500/api/reports');
            setAllReports(response.data);
        } catch (err) {
            console.error("Failed to load reports", err);
        }
    }, []);

    // Helper: Derive PTO Data points from history reports
    const deriveDataFromReports = useCallback((reportId?: string) => {
        // Filter reports to process
        let targetReports: any[] = [];
        if (reportId) {
            targetReports = allReports.filter(r => r.id === reportId);
        } else if (selectedShip) {
            targetReports = allReports.filter(r => {
                const isShip = r.items?.['R001'] === selectedShip;
                const isVoyage = selectedVoyage ? (r.items?.['R005'] === selectedVoyage) : true;
                
                const reportDate = r.tasks?.['T04'] || r.submittedAt;
                const isYear = selectedYear ? (reportDate && reportDate.startsWith(selectedYear)) : true;
                const isMonth = selectedMonthStr ? (reportDate && reportDate.startsWith(selectedMonthStr)) : true;
                
                return isShip && isVoyage && isYear && isMonth;
            });
        }

        if (targetReports.length === 0) return [];

        // All reports for this ship sorted for RPM calculation
        const shipReports = allReports
            .filter(r => r.items?.['R001'] === selectedShip)
            .sort((a, b) => {
                const da = new Date((a.tasks?.['T04'] || a.submittedAt).replace(' ', 'T')).getTime();
                const db = new Date((b.tasks?.['T04'] || b.submittedAt).replace(' ', 'T')).getTime();
                return da - db;
            });

        const parseVal = (v: any) => parseFloat(v) || 0;

        return targetReports.map(r => {
            let dateStr = r.tasks?.['T04'] || r.submittedAt;
            // ISO Fallback for more reliable parsing
            let timestamp = new Date(dateStr.replace(' ', 'T')).getTime();
            if (isNaN(timestamp)) timestamp = new Date(dateStr).getTime();

            // Find previous report to calculate RPM
            const idx = shipReports.findIndex(sr => sr.id === r.id);
            const prevR = idx > 0 ? shipReports[idx - 1] : null;

            let rpmP = 0, rpmS = 0;
            const r133_1 = parseVal(r.items?.['R133_1']);
            const r133_2 = parseVal(r.items?.['R133_2']);
            const rh_1 = parseVal(r.items?.['RH_R067_E01_1']);
            const rh_2 = parseVal(r.items?.['RH_R067_E01_2']);

            // PTO Specific Fields
            const pto_rh_1 = parseVal(r.items?.['RH_R115_E09_1']);
            const pto_rh_2 = parseVal(r.items?.['RH_R115_E09_2']);
            const pto_p_1 = parseVal(r.items?.['RH_R152_E09_1']);
            const pto_p_2 = parseVal(r.items?.['RH_R152_E09_2']);

            if (prevR && rh_1 > 0) {
                const prev_r133_1 = parseVal(prevR.items?.['R133_1']);
                if (r133_1 > prev_r133_1) rpmP = (r133_1 - prev_r133_1) / (rh_1 * 60);
            }
            if (prevR && rh_2 > 0) {
                const prev_r133_2 = parseVal(prevR.items?.['R133_2']);
                if (r133_2 > prev_r133_2) rpmS = (r133_2 - prev_r133_2) / (rh_2 * 60);
            }

            // Fallback to R074 if Revs calculation fails
            if (rpmP === 0) rpmP = parseVal(r.items?.['R074_E01_1'] || r.items?.['R074']);
            if (rpmS === 0) rpmS = parseVal(r.items?.['RH_R074_E01_2'] || r.items?.['R074']);

            const dg1 = parseVal(r.items?.['RH_R081_E03_1']);
            const dg2 = parseVal(r.items?.['RH_R081_E04_1']);
            const dg3 = parseVal(r.items?.['RH_R081_E05_1']);

            return {
                timestamp,
                dateStr,
                ptoActive: (pto_rh_1 > 0 || pto_rh_2 > 0 || pto_p_1 > 0 || pto_p_2 > 0) ? 1 : 0,
                esdTrigger: 0,
                portMeRpm: rpmP,
                portMePower: parseVal(r.items?.['RH_R078_E01_1']),
                stbdMeRpm: rpmS,
                stbdMePower: parseVal(r.items?.['RH_R078_E01_2']),
                duration: Math.max(pto_rh_1, pto_rh_2) || 0, // PTO Running Hours
                meDuration: Math.max(rh_1, rh_2) || 0, // ME Running Hours
                vesselSpeed: parseVal(r.items?.['R026']), // Vessel Speed in Knots
                ptoPower: pto_p_1 + pto_p_2,
                ptoPortPower: pto_p_1,
                ptoStbdPower: pto_p_2,
                dgPower: dg1 + dg2 + dg3
            } as any;
        }).sort((a, b) => a.timestamp - b.timestamp);
    }, [selectedShip, selectedYear, selectedVoyage, selectedMonthStr, allReports]);

    // Fetch Summarized PTO Data for a specific report
    const fetchServerData = useCallback(async (reportId?: string) => {
        setIsLoading(true);
        setErrorMsg(null);
        try {
            const url = reportId ? `${API_BASE}/data?reportId=${reportId}` : `${API_BASE}/data`;
            const response = await axios.get(url);
            const sorted = response.data.sort((a: any, b: any) => a.timestamp - b.timestamp);
            setData(sorted);
            setActiveSourceName(reportId ? `High-Speed Log (${reportId})` : 'Global Analysis');
        } catch (err: any) {
            if (err.response?.status === 404) {
                // FALLBACK: Derive from History if no specific log found
                if (reportId || selectedVoyage || selectedMonthStr || selectedYear) {
                    const derived = deriveDataFromReports(reportId);
                    setData(derived);
                    const sourceLabel = reportId ? `History Report (${reportId})` : 
                                       selectedVoyage ? `Voyage Trend (${selectedVoyage})` : 
                                       selectedMonthStr ? `Monthly Trend (${selectedMonthStr})` :
                                       `Yearly Trend (${selectedYear})`;
                    setActiveSourceName(sourceLabel);
                } else {
                    setActiveSourceName('No Data Found');
                    setData([]);
                }
            } else {
                setErrorMsg('Failed to connect to analysis server.');
            }
        } finally {
            setIsLoading(false);
        }
    }, [selectedShip, selectedYear, selectedVoyage, selectedMonthStr, allReports, deriveDataFromReports]); // Need allReports for derivation

    // Initial Load - Only populate reports
    useEffect(() => {
        loadReports();
    }, [loadReports]);

    // Removed handleFileUpload and handleFileChange

    // Removed handleDeleteData

    // Filter logic for cascading selects
    const ships = useMemo(() => {
        const set = new Set<string>();
        allReports.forEach(r => {
            const ship = r.items?.['R001'];
            if (ship) set.add(ship);
        });
        return Array.from(set).sort();
    }, [allReports]);

    const years = useMemo(() => {
        if (!selectedShip) return [];
        const set = new Set<string>();
        allReports
            .filter(r => r.items?.['R001'] === selectedShip)
            .forEach(r => {
                const dateStr = r.tasks?.['T04'] || r.submittedAt;
                if (dateStr) {
                    const d = new Date(dateStr.replace(' ', 'T'));
                    set.add(getYear(d).toString());
                }
            });
        return Array.from(set).sort().reverse();
    }, [allReports, selectedShip]);

    const voyages = useMemo(() => {
        if (!selectedShip) return [];
        const set = new Set<string>();
        allReports
            .filter(r => {
                const isShip = r.items?.['R001'] === selectedShip;
                const dateStr = r.tasks?.['T04'] || r.submittedAt;
                const isYear = selectedYear ? (dateStr && dateStr.startsWith(selectedYear)) : true;
                return isShip && isYear;
            })
            .forEach(r => {
                const voy = r.items?.['R005'];
                if (voy) set.add(voy);
            });
        return Array.from(set).sort();
    }, [allReports, selectedShip, selectedYear]);

    const months = useMemo(() => {
        if (!selectedShip) return [];
        const set = new Set<string>();
        allReports
            .filter(r => {
                const isShip = r.items?.['R001'] === selectedShip;
                const dateStr = r.tasks?.['T04'] || r.submittedAt;
                const isYear = selectedYear ? (dateStr && dateStr.startsWith(selectedYear)) : true;
                return isShip && isYear;
            })
            .forEach(r => {
                const dateStr = r.tasks?.['T04'] || r.submittedAt;
                if (dateStr) {
                    const d = new Date(dateStr.replace(' ', 'T'));
                    const m = `${getYear(d)}-${(getMonth(d) + 1).toString().padStart(2, '0')}`;
                    set.add(m);
                }
            });
        return Array.from(set).sort().reverse();
    }, [allReports, selectedShip, selectedYear]);

    const reportDates = useMemo(() => {
        if (!selectedShip) return [];
        return allReports.filter(r => {
            const shipMatch = r.items?.['R001'] === selectedShip;
            const voyageMatch = !selectedVoyage || r.items?.['R005'] === selectedVoyage;
            
            const dateStr = r.tasks?.['T04'] || r.submittedAt;
            let yearMatch = true;
            if (selectedYear && dateStr) {
                yearMatch = dateStr.startsWith(selectedYear);
            }

            let monthMatch = true;
            if (selectedMonthStr) {
                if (!dateStr) {
                    monthMatch = false;
                } else {
                    const d = new Date(dateStr.replace(' ', 'T'));
                    const mStr = `${getYear(d)}-${(getMonth(d) + 1).toString().padStart(2, '0')}`;
                    monthMatch = mStr === selectedMonthStr;
                }
            }
            return shipMatch && voyageMatch && yearMatch && monthMatch;
        }).sort((a, b) => new Date((b.tasks?.['T04'] || b.submittedAt).replace(' ', 'T')).getTime() - new Date((a.tasks?.['T04'] || a.submittedAt).replace(' ', 'T')).getTime());
    }, [allReports, selectedShip, selectedVoyage, selectedYear, selectedMonthStr]);

    // Handle Voyage selection change: show all reports for voyage
    // useEffect(() => {
    //     if (selectedVoyage && !selectedReportId) {
    //         fetchServerData(); // No reportId, will fallback to voyage reports
    //     }
    // }, [selectedVoyage, selectedReportId, fetchServerData]);

    // Handle direct selection change
    // useEffect(() => {
    //     if (selectedReportId) {
    //         fetchServerData(selectedReportId);
    //     }
    // }, [selectedReportId, fetchServerData]);

    // The data is now pre-filtered by reportId at the server level.
    // We can directly use the 'data' as 'filteredData' for the analysis.
    const filteredData = data;

    const metrics = useMemo(() => {
        if (!filteredData.length) return { runHours: 0, utilRate: 0, esdCount: 0, savedFuel: 0 };
        let activeCount = 0;
        let esds = 0;
        filteredData.forEach(d => {
            if (d.ptoActive === 1) activeCount++;
            if (d.esdTrigger === 1) esds++;
        });
        const totalPoints = filteredData.length;
        
        // Custom calculation for History Summary (where each point has a 'duration' and 'meDuration')
        if (activeSourceName.includes('History Summary')) {
            const totalPtoHrs = filteredData.reduce((sum, d: any) => sum + (d.duration || 0), 0);
            const totalMeHrs = filteredData.reduce((sum, d: any) => sum + (d.meDuration || 0), 0);
            const utilRate = totalMeHrs > 0 ? (totalPtoHrs / totalMeHrs) * 100 : 0;
            return { runHours: totalPtoHrs, utilRate, esdCount: 0, savedFuel: totalPtoHrs * fuelFactor };
        }

        const timeSpanMs = filteredData[filteredData.length - 1].timestamp - filteredData[0].timestamp;
        const hourPerPoint = totalPoints > 1 && timeSpanMs > 0 ? (timeSpanMs / (1000 * 60 * 60)) / totalPoints : 1;
        const runHrs = activeCount * hourPerPoint;
        return { runHours: runHrs, utilRate: (activeCount / totalPoints) * 100, esdCount: esds, savedFuel: runHrs * fuelFactor };
    }, [filteredData, fuelFactor, activeSourceName]);

    const esdEvents = useMemo(() => {
        return filteredData.filter(d => d.esdTrigger === 1).map((d, index) => ({
            id: `ESD-${index + 1}`,
            date: d.dateStr,
            status: 'Emergency Shut Down Triggered',
            action: 'PTO System Disengaged (Auto)'
        })).reverse();
    }, [filteredData]);

    // NEW: Find the last valid engine state in filtered data
    const lastEngineState = useMemo(() => {
        if (filteredData.length === 0) return null;
        for (let i = filteredData.length - 1; i >= 0; i--) {
            const row = filteredData[i];
            if ((row.portMeRpm !== undefined && row.portMeRpm > 0) || 
                (row.stbdMeRpm !== undefined && row.stbdMeRpm > 0)) {
                return row;
            }
        }
        return filteredData[filteredData.length - 1];
    }, [filteredData]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const val = payload[0].value;
            return (
                <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-slate-200 text-sm">
                    <p className="text-slate-400 mb-1">{label}</p>
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                        <span className="font-bold">PTO: {val != null ? val.toFixed(1) : '-'} hours</span>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">
            {/* Header section */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center px-1 gap-6">
                <div className="shrink-0 flex items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                            <Zap className="text-yellow-400" size={32} /> PTO Analysis
                        </h1>
                    </div>
                </div>

                {/* Reconfigured Selector Bar */}
                <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-4 w-full xl:w-auto">
                    <div className="bg-ocean-800 p-4 rounded-3xl border border-ocean-700 flex flex-wrap items-center gap-6 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-primary-500 to-emerald-500 opacity-50" />
                        
                        <FilterSelect 
                            label="Vessel Select" 
                            value={selectedShip} 
                            onChange={(v: string) => { 
                                setSelectedShip(v); 
                                setSelectedYear('');
                                setSelectedVoyage(''); 
                                setSelectedMonthStr(''); 
                                setSelectedReportId(''); 
                            }} 
                            options={ships} 
                            placeholder="Choose Vessel" 
                        />

                        <FilterSelect 
                            label="Year" 
                            value={selectedYear} 
                            onChange={(v: string) => { 
                                setSelectedYear(v); 
                                setSelectedVoyage(''); 
                                setSelectedMonthStr(''); 
                                setSelectedReportId(''); 
                            }} 
                            options={years} 
                            placeholder="All Years" 
                        />
                        
                        <FilterSelect 
                            label="Voyage" 
                            value={selectedVoyage} 
                            onChange={(v: string) => { 
                                setSelectedVoyage(v); 
                                setSelectedReportId(''); 
                            }} 
                            options={voyages} 
                            placeholder="All Voyages" 
                        />
                        
                        <FilterSelect 
                            label="Month" 
                            value={selectedMonthStr} 
                            onChange={(v: string) => { 
                                setSelectedMonthStr(v); 
                                setSelectedReportId(''); 
                            }} 
                            options={months} 
                            placeholder="Choose Month" 
                        />
                        
                        <FilterSelect 
                            label="Event Date" 
                            value={selectedReportId} 
                            onChange={setSelectedReportId} 
                            options={reportDates.map(r => ({ value: r.id, label: r.tasks?.['T04'] || r.submittedAt }))} 
                            placeholder="Select Event..." 
                        />

                        <div className="h-10 w-px bg-ocean-700 mx-2 hidden md:block" />
                        
                        <div className="flex items-center gap-3">
                            <button onClick={() => fetchServerData(selectedReportId)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs px-6 py-3 rounded-xl transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2 uppercase tracking-tighter whitespace-nowrap">
                                <Search size={16} /> Load Analysis
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl flex items-start gap-4">
                    <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={20} />
                    <p className="text-red-200/80 text-sm font-medium">{errorMsg}</p>
                </div>
            )}

            {/* Metrics cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard title="Utilization Rate" value={Math.floor(metrics.utilRate).toLocaleString()} unit="%" icon={<Activity className="text-emerald-400" />} trend="System Load" />
                <MetricCard title="PTO Running Hours" value={Math.floor(metrics.runHours).toLocaleString()} unit="hrs" icon={<Clock className="text-blue-400" />} trend="Active Duty" />
                <MetricCard title={`Fuel Savings (Est. ${fuelFactor} MT/Hrs)`} value={Math.floor(metrics.savedFuel).toLocaleString()} unit="MT" icon={<Zap className="text-yellow-400" />} trend="Eco Gain">
                    <div className="mt-4 pt-4 border-t border-ocean-700/50">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Fuel Factor (MT/Hrs)</span>
                            <input 
                                type="number" 
                                step="0.1"
                                className="bg-ocean-900 border border-ocean-600 rounded-xl px-4 py-2 text-white text-sm font-black focus:border-primary-500 outline-none w-full transition-all" 
                                value={fuelFactor} 
                                onChange={e => setFuelFactor(parseFloat(e.target.value) || 0)} 
                            />
                        </div>
                    </div>
                </MetricCard>
                <MetricCard title="ESD Triggers" value={metrics.esdCount} unit="Events" icon={<ShieldAlert className={metrics.esdCount > 0 ? "text-red-400" : "text-slate-400"} />} trend="Stability" alert={metrics.esdCount > 0} />
            </div>

            {/* Main chart and logs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-ocean-800 rounded-3xl p-8 border border-ocean-700 shadow-2xl relative overflow-hidden">
                    {isLoading && <LoadingOverlay />}
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter italic">
                            <Activity size={24} className="text-primary-500" /> Operation Timeline
                        </h3>
                        <Legend />
                    </div>
                    <div className="h-[400px] w-full pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={filteredData} margin={{ left: -20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis 
                                    dataKey="dateStr" 
                                    stroke="#475569" 
                                    tick={{ fontSize: 10, fontWeight: 700 }} 
                                    minTickGap={80} 
                                    dy={10} 
                                    tickFormatter={(str) => {
                                        try {
                                            const d = new Date(str);
                                            return `${(d.getMonth()+1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')}`;
                                        } catch (e) {
                                            return str;
                                        }
                                    }}
                                />
                                <YAxis 
                                    domain={[0, 25]} 
                                    ticks={[0, 6, 12, 18, 24, 25]} 
                                    stroke="#475569" 
                                    tick={{ fontSize: 10, fontWeight: 700 }} 
                                    label={{ value: 'Operating Hours (h)', angle: -90, position: 'insideLeft', offset: 0, fill: '#64748b', fontSize: 10, fontWeight: 800 }}
                                />
                                <RechartsTooltip content={<CustomTooltip />} />
                                <defs>
                                    <linearGradient id="colorPto" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#86efac" stopOpacity={0.6}/>
                                        <stop offset="95%" stopColor="#86efac" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <ReferenceLine y={24} stroke="#fff" strokeWidth={2} label={{ value: 'Limit: 24h', position: 'right', fill: '#fff', fontSize: 10, fontWeight: 900 }} />
                                <Area dataKey="duration" name="Running Hours" stroke="#4ade80" fill="url(#colorPto)" strokeWidth={3} isAnimationActive={true} />
                                <Line type="monotone" dataKey={d => d.esdTrigger === 1 ? 24 : null} stroke="transparent" dot={{ r: 6, fill: '#ef4444', strokeWidth: 2, stroke: '#7f1d1d' }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-ocean-800 rounded-3xl border border-ocean-700 shadow-2xl overflow-hidden flex flex-col">
                    <div className="p-8 border-b border-ocean-700 bg-ocean-800/10 flex items-center justify-between">
                        <h3 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter italic">
                            <ShieldAlert size={24} className="text-red-500" /> Critical Logs
                        </h3>
                        <span className="bg-red-500/10 text-red-500 text-[10px] font-black px-2 py-1 rounded border border-red-500/20">{esdEvents.length} TOTAL</span>
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-ocean-600">
                        {esdEvents.length > 0 ? (
                            <table className="w-full text-left">
                                <thead className="bg-ocean-900/50 sticky top-0 z-10">
                                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        <th className="px-6 py-4">ID</th>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs font-bold">
                                    {esdEvents.map(evt => (
                                        <tr key={evt.id} className="border-b border-ocean-700/50 hover:bg-ocean-700/30 transition-colors">
                                            <td className="px-6 py-4 text-slate-400 font-mono">{evt.id}</td>
                                            <td className="px-6 py-4 text-slate-100">{evt.date}</td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 rounded-lg bg-red-400 text-slate-900 text-[9px] font-black uppercase">ESD TRIGGERED</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 py-20">
                                <ShieldAlert size={48} className="mb-4 opacity-10" />
                                <p className="text-sm font-bold uppercase tracking-widest">No Critical Events</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${zoomedEngine ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'} transition-all duration-500`}>
                <EngineLayoutChart 
                    title="Main Engine - Port" 
                    currentRpm={lastEngineState?.portMeRpm} 
                    currentPower={lastEngineState?.portMePower} 
                    vesselSpeed={lastEngineState?.vesselSpeed}
                    historyData={filteredData.filter(d => (d.portMeRpm || 0) > 0).map(d => ({ rpm: d.portMeRpm!, power: d.portMePower! }))}
                    onZoom={() => setZoomedEngine('port')}
                    currentPtoPower={lastEngineState?.ptoPortPower}
                    currentDgPower={lastEngineState?.dgPower}
                />
                <EngineLayoutChart 
                    title="Main Engine - Stbd" 
                    currentRpm={lastEngineState?.stbdMeRpm} 
                    currentPower={lastEngineState?.stbdMePower} 
                    vesselSpeed={lastEngineState?.vesselSpeed}
                    historyData={filteredData.filter(d => (d.stbdMeRpm || 0) > 0).map(d => ({ rpm: d.stbdMeRpm!, power: d.stbdMePower! }))}
                    onZoom={() => setZoomedEngine('stbd')}
                    currentPtoPower={lastEngineState?.ptoStbdPower}
                    currentDgPower={lastEngineState?.dgPower}
                />
            </div>

            {/* FULL SCREEN ZOOM MODAL */}
            {zoomedEngine && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-2xl p-4 md:p-12 animate-in fade-in duration-300">
                    <button 
                        onClick={() => setZoomedEngine(null)}
                        className="absolute top-8 right-8 z-[110] bg-white/10 hover:bg-white/20 p-4 rounded-full text-white transition-all hover:rotate-90 active:scale-90"
                    >
                        <X size={32} />
                    </button>
                    
                    <div className="w-full max-w-7xl h-full flex flex-col pt-12 animate-in zoom-in-95 duration-500 pb-12">
                        {zoomedEngine === 'port' ? (
                            <EngineLayoutChart 
                                title="Main Engine - Port" 
                                currentRpm={lastEngineState?.portMeRpm} 
                                currentPower={lastEngineState?.portMePower} 
                                vesselSpeed={lastEngineState?.vesselSpeed}
                                historyData={filteredData.filter(d => (d.portMeRpm || 0) > 0).map(d => ({ rpm: d.portMeRpm!, power: d.portMePower! }))}
                                isZoomed={true}
                                currentPtoPower={lastEngineState?.ptoPortPower}
                                currentDgPower={lastEngineState?.dgPower}
                            />
                        ) : (
                            <EngineLayoutChart 
                                title="Main Engine - Stbd" 
                                currentRpm={lastEngineState?.stbdMeRpm} 
                                currentPower={lastEngineState?.stbdMePower} 
                                vesselSpeed={lastEngineState?.vesselSpeed}
                                historyData={filteredData.filter(d => (d.stbdMeRpm || 0) > 0).map(d => ({ rpm: d.stbdMeRpm!, power: d.stbdMePower! }))}
                                isZoomed={true}
                                currentPtoPower={lastEngineState?.ptoStbdPower}
                                currentDgPower={lastEngineState?.dgPower}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const EngineChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        // Filter out duplicate entries by name
        const seen = new Set();
        const items = payload.filter((item: any) => {
            const name = item.name || item.dataKey;
            if (seen.has(name) || name === 'x') return false;
            seen.add(name);
            return true;
        });

        return (
            <div className="bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-2xl text-slate-200 text-xs backdrop-blur-md">
                <p className="text-slate-500 font-black mb-3 border-b border-ocean-700 pb-2 uppercase tracking-widest">
                    Engine Speed: <span className="text-white italic">{label?.toFixed(1)} RPM</span>
                </p>
                <div className="space-y-2">
                    {items.map((item: any) => {
                        const val = typeof item.value === 'number' ? Math.floor(item.value).toLocaleString() : item.value;
                        const name = item.name || item.dataKey;
                        // Map internal keys to professional labels if they haven't been renamed
                        const displayLabels: Record<string, string> = {
                            'red': 'Short-term Limit',
                            'yellow': 'PTO Layout Limit',
                            'green': 'Propeller Curve',
                            'y': 'Current Load'
                        };
                        const displayName = displayLabels[name] || name;

                        return (
                            <div key={name} className="flex items-center justify-between gap-8">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full shadow-inner" style={{ backgroundColor: item.color || item.fill }}></div>
                                    <span className="font-black opacity-70 uppercase tracking-tight text-[10px]">{displayName}</span>
                                </div>
                                <span className="font-mono font-black text-white">{val} kW</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
    return null;
};

const EngineLayoutChart = ({ title, currentRpm, currentPower, vesselSpeed, historyData, onZoom, isZoomed, currentPtoPower, currentDgPower }: { title: string, currentRpm?: number, currentPower?: number, vesselSpeed?: number, historyData?: { rpm: number, power: number }[], onZoom?: () => void, isZoomed?: boolean, currentPtoPower?: number, currentDgPower?: number }) => {
    // SMCR Reference
    const REF_RPM = 67.4;
    const REF_KW = 11640;

    // Generate zone data for Shading
    // y0: Low bound, y1: Propeller (Green), y2: PTO Limit (Yellow), y3: Layout Limit (Red)
    const zoneData = useMemo(() => {
        const points = [];
        for (let xPer = 50; xPer <= 120; xPer += 2) {
            const x = (xPer / 100) * REF_RPM;
            const yProp = Math.pow(xPer / 105, 3) * REF_KW; // Light Propeller (LRM 5%)
            const yPtoLimit = 0.95 * Math.pow(xPer / 100, 2.4) * REF_KW; // MAN ES PTO Layout Limit
            const yEngLimit = 1.0 * Math.pow(xPer / 100, 2) * REF_KW; // Engine Load Diagram (Top)

            points.push({
                x,
                green: yProp,
                yellow: yPtoLimit,
                red: yEngLimit
            });
        }
        return points;
    }, [REF_RPM, REF_KW]);


    // Calculate current threshold values at currentRpm
    const thresholds = useMemo(() => {
        if (currentRpm === undefined || currentRpm === null) return null;
        const xPer = (currentRpm / REF_RPM) * 100;
        return {
            green: Math.floor(Math.pow(xPer / 105, 3) * REF_KW),
            yellow: Math.floor(0.95 * Math.pow(xPer / 100, 2.4) * REF_KW),
            red: Math.floor(Math.pow(xPer / 100, 2) * REF_KW)
        };
    }, [currentRpm, REF_RPM, REF_KW]);

    return (
        <div className={cn("bg-ocean-800 rounded-3xl p-8 border border-ocean-700 shadow-2xl overflow-hidden relative group transition-all duration-500", 
            isZoomed ? "h-full flex flex-col pt-12" : "")}>
            <h3 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter italic mb-2">
                <Activity size={24} className="text-blue-500" /> {title} - PTO Situation Check
            </h3>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 px-1 italic">
                Verifying if current load is within PTO Layout Limits
            </p>

            {onZoom && (
                <button 
                    onClick={onZoom}
                    className="absolute top-6 right-6 p-2 rounded-xl bg-ocean-900 border border-ocean-600 text-slate-400 hover:text-white hover:border-primary-500 transition-all hover:scale-110 active:scale-95 group-hover:opacity-100 md:opacity-0"
                    title="Zoom Chart"
                >
                    <Search size={20} />
                </button>
            )}
            
            <div className={cn("w-full relative", isZoomed ? "flex-1 min-h-[500px]" : "h-[350px]")}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={zoneData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="1 1" stroke="#334155" />
                        
                        {/* THE COLOR ZONES - Ordered from Largest to Smallest to avoid muddy blending */}
                        {/* Red: Short-term / Overload Warning */}
                        <Area dataKey="red" stroke="none" fill="#ef4444" fillOpacity={0.2} isAnimationActive={false} />
                        {/* Yellow: Heavy / PTO Available Region */}
                        <Area dataKey="yellow" stroke="none" fill="#eab308" fillOpacity={0.3} isAnimationActive={false} />
                        {/* Green: Recommended Operation */}
                        <Area dataKey="green" stroke="none" fill="#22c55e" fillOpacity={0.4} isAnimationActive={false} />

                        <XAxis 
                            type="number" 
                            dataKey="x" 
                            domain={[REF_RPM * 0.5, REF_RPM * 1.2]} 
                            stroke="#64748b" 
                            tick={{fontSize: 10, fontWeight: 800}} 
                            label={{ value: 'Engine Speed (RPM)', position: 'bottom', offset: 0, fontSize: 10, fill: '#64748b', fontWeight: 900 }}
                            tickFormatter={(v) => v.toFixed(1)}
                        />
                        <YAxis 
                            type="number" 
                            domain={[0, isZoomed ? REF_KW * 0.5 : REF_KW * 1.5]} 
                            stroke="#64748b" 
                            tick={{fontSize: 10, fontWeight: 800}}
                            label={{ value: 'Main Engine Output (kW)', angle: -90, position: 'insideLeft', offset: -5, fontSize: 10, fill: '#64748b', fontWeight: 900 }}
                            tickFormatter={(v) => v.toLocaleString()}
                        />
                        <RechartsTooltip content={<EngineChartTooltip />} />
                        
                        {/* Reference lines */}
                        {/* PTO Layout Limit (Pink Line from user image) */}
                        <Line dataKey="yellow" stroke="#ec4899" strokeWidth={3} dot={false} isAnimationActive={false} />
                        {/* Light Propeller Curve (Dark Blue) */}
                        <Line dataKey="green" stroke="#1e40af" strokeWidth={2} dot={false} strokeDasharray="5 5" isAnimationActive={false} />
                        
                        {/* Layout envelope removed as requested */}

                        {/* Current Working Point - Check for defined instead of truthy */}
                        {(currentRpm !== undefined && currentRpm !== null) && (currentPower !== undefined && currentPower !== null) && (
                            <Line 
                                name="Current Load"
                                data={[{ x: currentRpm, y: currentPower }]} 
                                type="linear" 
                                dataKey="y" 
                                stroke="transparent" 
                                dot={{ r: 1.9, fill: '#ef4444', stroke: '#fff', strokeWidth: 0.5 }} 
                                isAnimationActive={true}
                            />
                        )}

                        {/* History dots (0.2mm diameter = ~0.4px radius) */}
                        {historyData && historyData.length > 0 && (
                            <Scatter 
                                name="History Points" 
                                data={historyData} 
                                fill="#ef4444" 
                                shape={<circle r={0.4} />} 
                                isAnimationActive={false} 
                            />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
                
                {/* Manual Legend overlays - Cleaned and Formatted */}
                <div className="absolute top-4 left-20 flex flex-col gap-1.5 pointer-events-none z-20">
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase text-[#ef4444] bg-[#ef4444]/10 px-2.5 py-1 rounded border border-[#ef4444]/20 shadow-lg backdrop-blur-sm">
                        <span>Short-term Load:</span>
                        <span className="font-mono text-[10px]">{thresholds ? `${thresholds.red.toLocaleString()} kW` : '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase text-[#eab308] bg-[#eab308]/10 px-2.5 py-1 rounded border border-[#eab308]/20 shadow-lg backdrop-blur-sm">
                        <span>Safe PTO Range:</span>
                        <span className="font-mono text-[10px]">{thresholds ? `${thresholds.yellow.toLocaleString()} kW` : '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase text-[#22c55e] bg-[#22c55e]/10 px-2.5 py-1 rounded border border-[#22c55e]/20 shadow-lg backdrop-blur-sm">
                        <span>Recommended Area:</span>
                        <span className="font-mono text-[10px]">{thresholds ? `${thresholds.green.toLocaleString()} kW` : '-'}</span>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex flex-col gap-4">
                {/* Top Row: RPM and Speed */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-ocean-900/50 p-4 rounded-2xl border border-ocean-700/50 flex flex-col">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Last RPM</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-black text-white">{currentRpm != null && !isNaN(currentRpm) ? Math.floor(currentRpm).toLocaleString() : '-'}</span>
                            <span className="text-xs text-slate-500 font-bold">RPM</span>
                        </div>
                    </div>
                    <div className="bg-ocean-900/50 p-4 rounded-2xl border border-ocean-700/50 flex flex-col">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Last Speed</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-black text-white">{vesselSpeed != null ? vesselSpeed.toFixed(1) : '-'}</span>
                            <span className="text-xs text-slate-500 font-bold">KNOT</span>
                        </div>
                    </div>
                </div>

                {/* Bottom Row: Power Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-ocean-900/50 p-4 rounded-2xl border border-ocean-700/50 flex flex-col">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Last M/E Power</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-black text-white">{currentPower != null && !isNaN(currentPower) ? Math.floor(currentPower).toLocaleString() : '-'}</span>
                            <span className="text-xs text-slate-500 font-bold">kW</span>
                        </div>
                    </div>
                    <div className="bg-ocean-900/50 p-4 rounded-2xl border border-ocean-700/50 flex flex-col">
                        <span className="text-[10px] font-black text-emerald-500/70 uppercase tracking-widest mb-1">Last PTO Power</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-black text-emerald-400">{currentPtoPower != null && !isNaN(currentPtoPower) ? Math.floor(currentPtoPower).toLocaleString() : '-'}</span>
                            <span className="text-xs text-slate-500 font-bold">kW</span>
                        </div>
                    </div>
                    <div className="bg-ocean-900/50 p-4 rounded-2xl border border-ocean-700/50 flex flex-col">
                        <span className="text-[10px] font-black text-amber-500/70 uppercase tracking-widest mb-1">Last D/G Power</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-black text-amber-500">{currentDgPower != null && !isNaN(currentDgPower) ? Math.floor(currentDgPower).toLocaleString() : '-'}</span>
                            <span className="text-xs text-slate-500 font-bold">kW</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* PTO check summary */}
            <div className="mt-4 p-4 rounded-2xl border flex items-center gap-4 transition-colors duration-500" 
                 style={{ 
                     backgroundColor: (currentPower !== undefined && currentPower !== null) && (currentRpm !== undefined && currentRpm !== null) ? (
                         currentPower > (0.95 * Math.pow(((currentRpm/REF_RPM)*100) / 100, 2.4) * REF_KW) ? 'rgba(239, 68, 68, 0.1)' : 
                         currentPower > (Math.pow(((currentRpm/REF_RPM)*100) / 105, 3) * REF_KW) ? 'rgba(234, 179, 8, 0.1)' : 'rgba(34, 197, 94, 0.1)'
                     ) : 'transparent',
                     borderColor: (currentPower !== undefined && currentPower !== null) && (currentRpm !== undefined && currentRpm !== null) ? (
                        currentPower > (0.95 * Math.pow(((currentRpm/REF_RPM)*100) / 100, 2.4) * REF_KW) ? 'rgba(239, 68, 68, 0.3)' : 
                        currentPower > (Math.pow(((currentRpm/REF_RPM)*100) / 105, 3) * REF_KW) ? 'rgba(234, 179, 8, 0.3)' : 'rgba(34, 197, 94, 0.3)'
                    ) : 'transparent'
                 }}>
                <div className={cn("p-2 rounded-lg", 
                     (currentPower !== undefined && currentPower !== null) && (currentRpm !== undefined && currentRpm !== null) ? (
                        currentPower > (0.95 * Math.pow(((currentRpm/REF_RPM)*100) / 100, 2.4) * REF_KW) ? 'bg-red-500 text-white' : 
                        currentPower > (Math.pow(((currentRpm/REF_RPM)*100) / 105, 3) * REF_KW) ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white'
                    ) : 'bg-slate-700 text-slate-300'
                )}>
                    {(currentPower !== undefined && currentPower !== null) && (currentRpm !== undefined && currentRpm !== null) ? (
                         currentPower > (0.95 * Math.pow(((currentRpm/REF_RPM)*100) / 100, 2.4) * REF_KW) ? <ShieldAlert size={20} /> : <Zap size={20} />
                    ) : <Activity size={20} />}
                </div>
                <div>
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Hybrid Status</div>
                    <div className="text-sm font-black text-white uppercase italic">
                        {(currentPower !== undefined && currentPower !== null) && (currentRpm !== undefined && currentRpm !== null) ? (
                             currentPower > (0.95 * Math.pow(((currentRpm/REF_RPM)*100) / 100, 2.4) * REF_KW) ? "PTO Layout Violation (Critical)" : 
                             currentPower > (Math.pow(((currentRpm/REF_RPM)*100) / 105, 3) * REF_KW) ? "Safe Hybrid Operation (PTO Available)" : "Optimal Propulsion (Recommended)" 
                        ) : "No Engine Data detected"}
                    </div>
                </div>
            </div>
        </div>
    );
};

const FilterSelect = ({ label, value, onChange, options, placeholder }: any) => (
    <div className="flex flex-col gap-1">
        <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">{label}</label>
        <div className="relative">
            <select value={value} onChange={e => onChange(e.target.value)}
                className="bg-ocean-900 border border-ocean-600 rounded-xl px-3 py-1.5 pr-8 text-xs font-black text-white focus:border-primary-500 outline-none appearance-none min-w-[120px] cursor-pointer shadow-inner transition-all hover:border-ocean-500">
                {placeholder && <option value="">{placeholder}</option>}
                {options.map((opt: any) => {
                    const val = typeof opt === 'string' ? opt : opt.value;
                    const lbl = typeof opt === 'string' ? opt : opt.label;
                    return <option key={val} value={val}>{lbl}</option>;
                })}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
    </div>
);

const MetricCard = ({ title, value, unit, icon, trend, alert, children }: any) => (
    <div className={cn("bg-ocean-800 rounded-3xl p-8 border transition-all duration-300 group relative overflow-hidden",
        alert ? "border-red-500/50 shadow-2xl shadow-red-500/5 bg-gradient-to-br from-ocean-800 to-red-950/20" : "border-ocean-700 shadow-xl")}>
        <div className="flex justify-between items-start mb-6 relative z-10">
            <h4 className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{title}</h4>
            <div className={cn("p-3 rounded-2xl shadow-inner", alert ? "bg-red-500/10 text-red-500" : "bg-ocean-900 text-slate-400 group-hover:text-primary-400 transition-colors")}>{icon}</div>
        </div>
        <div className="flex items-end gap-2 mb-2 relative z-10">
            <span className={cn("text-4xl font-black tracking-tight", alert ? "text-red-400" : "text-white")}>{value}</span>
            <span className="text-slate-500 text-xs font-black mb-1">{unit}</span>
        </div>
        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity mb-2">{trend}</div>
        {children && <div className="relative z-10">{children}</div>}
    </div>
);

const Legend = () => (
    <div className="flex gap-6 text-[10px] font-black font-mono tracking-widest">
        <div className="flex items-center gap-2"><span className="w-3 h-3 bg-emerald-400 rounded-sm shadow-sm opacity-60"></span> PTO RUNNING HOURS (H)</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/40"></span> ESD EVENT</div>
    </div>
);

const LoadingOverlay = () => (
    <div className="absolute inset-0 bg-ocean-800/90 backdrop-blur-md z-50 flex flex-col items-center justify-center space-y-6">
        <Activity className="text-primary-500 animate-spin" size={48} />
        <div className="text-white font-black tracking-[0.2em] text-[10px] uppercase animate-pulse text-center">
            Analysis Server Processing...<br/>
            (Fetching History Data)
        </div>
    </div>
);


export default PtoAnalysis;
