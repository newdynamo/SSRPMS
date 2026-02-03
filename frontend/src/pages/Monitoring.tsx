import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, CircleMarker } from 'react-leaflet';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Ship, Navigation, Activity, Droplet, Zap, Gauge, History, Calendar, Map as MapIcon } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { cn } from '../utils/cn';
import { fetchReports } from '../api/reports';
import { fetchShips } from '../api/ships';
import { fetchCodes } from '../api/codes';
import type { Ship as ShipType, Report, CodeData } from '../types';

// Fix Leaflet marker icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Helper to center map and handle resize
const MapUpdater = ({ center }: { center: [number, number] }) => {
    const map = useMap();

    useEffect(() => {
        // Invalidate size to ensure tiles render across full width (fixes "blue void" issue)
        map.invalidateSize();
        map.setView(center, map.getZoom());
    }, [center, map]);

    // Also invalidate on mount after a short delay to catch final layout paint
    useEffect(() => {
        const timer = setTimeout(() => {
            map.invalidateSize();
        }, 100);
        return () => clearTimeout(timer);
    }, [map]);

    return null;
};

const Monitoring = () => {
    const [ships, setShips] = useState<ShipType[]>([]);
    const [reports, setReports] = useState<Report[]>([]);
    const [codes, setCodes] = useState<CodeData | null>(null);
    const [selectedShipId, setSelectedShipId] = useState<string | null>(null);
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [selectedVoyage, setSelectedVoyage] = useState<string>('');

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

                if (sData.length > 0) {
                    setSelectedShipId(sData[0].code || sData[0].name); // Prefer code, fallback to name
                }
            } catch (err) {
                console.error("Failed to load monitoring data", err);
            }
        };
        load();
    }, []);

    // Derived State
    const activeShip = ships.find(s => (s.code === selectedShipId) || (s.name === selectedShipId)); // Match either
    const activeReports = reports
        .filter(r => activeShip && r.items['R001'] === activeShip.name)
        .sort((a, b) => {
            // Sort by Date Descending
            const tA = new Date(a.items['R003'] as string || a.submittedAt || 0).getTime();
            const tB = new Date(b.items['R003'] as string || b.submittedAt || 0).getTime();
            return tB - tA;
        });

    // Extract unique voyages
    const uniqueVoyages = Array.from(new Set(activeReports.map(r => r.items['R005'] as string).filter(Boolean))).sort().reverse();

    // Filter reports by voyage if selected
    const displayedReports = selectedVoyage
        ? activeReports.filter(r => r.items['R005'] === selectedVoyage)
        : activeReports;

    const selectedReport = selectedReportId
        ? displayedReports.find(r => r.id === selectedReportId)
        : displayedReports[0]; // Default to latest in the filtered list

    // Reset Voyage when ship changes
    useEffect(() => {
        setSelectedVoyage('');
        setSelectedReportId(null);
    }, [selectedShipId]);

    // Extract Data for Dashboard
    const getVal = (code: string) => selectedReport?.items[code] || 0;
    const getStr = (code: string) => String(selectedReport?.items[code] || '-');

    // Parse Position from R006 (DD-MM.M N / DDD-MM.M E)
    const parseCoordinates = (posStr: string | undefined): [number, number] | null => {
        if (!posStr) return null;
        try {
            // Expected format: "35-05.0 N / 139-40.0 E"
            const [latPart, longPart] = posStr.split('/').map(s => s.trim());

            const toDecimal = (dmStr: string) => {
                // "35-05.0 N" -> deg=35, min=5.0, dir=N
                const parts = dmStr.split(' ');
                const dir = parts[parts.length - 1]; // N, S, E, W
                const val = parts[0];
                const [deg, min] = val.split('-').map(parseFloat);

                let decimal = deg + (min / 60);
                if (dir === 'S' || dir === 'W') decimal = -decimal;
                return decimal;
            };

            if (latPart && longPart) {
                return [toDecimal(latPart), toDecimal(longPart)];
            }
        } catch (e) {
            console.warn("Failed to parse coordinates", posStr);
        }
        return null;
    };

    // Calculate Active Position
    // Default to mock position if parse fails or no report
    const defaultPos: [number, number] = (activeShip?.name === 'PUTERI SAADONG') ? [1.3521, 103.8198] : [35.6895, 139.6917];
    const parsedPos = parseCoordinates(getStr('R006'));
    const activePosition = parsedPos || defaultPos;

    // Calculate Voyage Path
    const voyagePath = displayedReports
        .map(r => ({
            id: r.id,
            pos: parseCoordinates(r.items['R006'] as string),
            date: r.items['R003'] as string,
            event: codes?.evCodes.find(e => e.code === r.evCode)?.name || r.evCode
        }))
        .filter(p => p.pos !== null) as { id: string, pos: [number, number], date: string, event: string }[];

    // Sort path chronological (ascending) for line drawing
    voyagePath.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Mapping Values
    const speed = parseFloat(getVal('R026') as string) || parseFloat(getVal('R077') as string) || parseFloat(getVal('R034') as string) || 0; // Current Speed -> Avg Speed -> Est Speed
    // RPM Calculation
    // Formula: (Today Eng.Mile / Propeller Pitch) / (Avg ME Run Hour) / 60
    let rpm = 0;

    // Resolve Configuration Source (for Propeller Pitch)
    const configShip = activeShip?.configSourceShipId
        ? ships.find(s => s.code === activeShip.configSourceShipId) || activeShip
        : activeShip;

    const propPitch = parseFloat(configShip?.customValues?.['Propeller Pitch'] || '0');
    const todayEngMile = parseFloat(getVal('R073') as string) || 0;

    // Calculate Average Run Hour for Active M/Es
    // Equipment config should also respect configSourceShipId if activeShip doesn't have it (though typical structure usually has eq on ship, or inherited?)
    // Note: The 'Ship' type definition suggests 'equipment' is on the ship object. 
    // If 'activeShip.equipment' is empty/undefined, we might need to check configShip, but actual run hours (R067) are definitely on the specific ship/report.
    // However, the *definition* of equipment (E01 count) might be on configShip if not on active.
    // Let's assume activeShip has valid equipment list or inherits it (if backend handles it). 
    // Looking at ships.json, ships with configSourceShipId do NOT have 'equipment' array listed.
    // So we MUST use configShip for equipment definition too.

    const targetShipForEq = activeShip?.equipment?.length ? activeShip : configShip;
    const meEq = targetShipForEq?.equipment?.find(e => e.code === 'E01' && e.installed);

    let avgMeRh = 0;
    if (meEq && meEq.count > 0) {
        let totalRh = 0;
        let activeCount = 0;
        for (let i = 1; i <= meEq.count; i++) {
            const rhVal = parseFloat(getVal(`RH_R067_E01_${i}`) as string) || 0;
            if (rhVal > 0) {
                totalRh += rhVal;
                activeCount++;
            }
        }
        if (activeCount > 0) {
            avgMeRh = totalRh / activeCount;
        }
    }

    if (propPitch > 0 && avgMeRh > 0) {
        rpm = (todayEngMile / propPitch) / avgMeRh / 60;
    } else {
        rpm = 0;
    }
    const distance = parseFloat(getVal('R013') as string) || parseFloat(getVal('R073') as string) || 0; // Today Distance -> Today Eng.Mile

    // Weather
    const weather = {
        state: getStr('R014'),
        bf: getStr('R019'), // Wind Force (BF?) - R019 is Wind Force
        windDir: getStr('R020'), // Wind Dir
        windForce: getStr('R019'), // Wind Force
        waveDir: getStr('R023'), // Sea/Wave Dir
        waveForce: getStr('R022'), // Sea Height (used as force)
        atmosTemp: getVal('R016'),
        seaTemp: getVal('R021')
    };

    // Consumption (Today Consumed R031)

    // Dynamic Fuel Metrics Generation
    const fuelMetrics = configShip?.fuels?.map(fuel => {
        const fDef = codes?.fCodes?.find(f => f.code === fuel.code);
        const name = fDef?.name || fuel.code;

        // Priority: Ship Config LCV > Global Code LCV > Default
        // Note: Ship Config might use a different scale (e.g. 0.406) vs Global (0.0405)
        let lcv = fuel.lcv || fDef?.lcv || 0.0405;

        // Unit Normalization Heuristic
        // Target: MJ/Ton (approx 40,000 - 50,000)
        // Global (0.0405 GJ/kg) -> * 1,000,000 = 40,500 MJ/Ton
        // Config (0.406 ?) -> * 100,000 = 40,600 MJ/Ton
        let factor = 1_000_000;
        if (lcv > 0.1 && lcv < 100) {
            factor = 100_000;
        } else if (lcv >= 100) {
            // If user enters actual MJ/kg (e.g. 40.5) -> * 1000
            factor = 1000;
        }

        const r031Key = `R031_${fuel.code}`;
        let val = parseFloat(getVal(r031Key) as string) || 0;

        // Fallback: If R031 (Total) is 0, try to sum up individual CONS_..._{fCode} inputs
        if (val === 0 && selectedReport?.items) {
            Object.keys(selectedReport.items).forEach(k => {
                // Key format: CONS_{eq}_{unit}_{fCode}
                if (k.startsWith('CONS_') && k.endsWith(`_${fuel.code}`)) {
                    const subVal = parseFloat(selectedReport.items[k] as string) || 0;
                    val += subVal;
                }
            });
        }

        const energy = val * lcv * factor;

        return { name, val, energy };
    }) || [];

    const totalEnergy = fuelMetrics.reduce((acc, curr) => acc + curr.energy, 0);

    // Remove old manual variables as they are replaced by dynamic list
    // const hfoCode...
    // const mgoCode...
    // const lngCode...
    // const getFuelConsumed...
    // const hfoCons...
    // const mgoCons...
    // const lngCons...
    // const totalEnergy...

    // Graph Data - Mocked still, but could be derived from `activeReports` history
    const graphData = activeReports.slice(0, 10).reverse().map(r => ({
        time: new Date(r.items['R003'] as string || r.submittedAt || 0).getDate(), // Day
        laden: parseFloat(r.items['R103'] as string || '0'), // LNG Cargo Load?
        ballast: parseFloat(r.items['R053'] as string || '0')
    }));

    const voyageFrom = getStr('R005'); // Just use Voyage No for now?
    // Actually typically From/To are R006? No. 
    // R005 is Voyage No. 
    // R007 is Next Port. 
    // R012 is Arrival Type.
    // Let's us Voyage No and Next Port as proxies.
    const voyageTo = getStr('R007');

    // Event Name
    const evName = codes?.evCodes.find(e => e.code === selectedReport?.evCode)?.name || selectedReport?.evCode || 'No Data';

    if (!activeShip) return <div className="text-white p-8">Loading...</div>;

    return (
        <div className="flex flex-col gap-6 pb-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Monitoring</h1>
                </div>

                <div className="flex gap-4">
                    {/* Ship Selector */}
                    <div className="flex items-center gap-2 bg-ocean-800 p-1 rounded-lg border border-ocean-700 max-w-xs">
                        <div className="px-2 text-slate-400">
                            <Ship size={16} />
                        </div>
                        <select
                            className="bg-transparent text-sm text-white outline-none w-48 truncate"
                            value={selectedShipId || ''}
                            onChange={(e) => {
                                setSelectedShipId(e.target.value);
                            }}
                        >
                            {ships.map(ship => (
                                <option key={ship.code} value={ship.code || ship.name} className="bg-ocean-900 text-white">
                                    {ship.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Voyage Selector */}
                    <div className="flex items-center gap-2 bg-ocean-800 p-1 rounded-lg border border-ocean-700 max-w-xs">
                        <div className="px-2 text-slate-400">
                            <MapIcon size={16} />
                        </div>
                        <select
                            className="bg-transparent text-sm text-white outline-none w-32 truncate"
                            value={selectedVoyage}
                            onChange={(e) => {
                                setSelectedVoyage(e.target.value);
                                setSelectedReportId(null);
                            }}
                        >
                            <option value="" className="bg-ocean-900 text-white">All Voyages</option>
                            {uniqueVoyages.map(v => (
                                <option key={v} value={v} className="bg-ocean-900 text-white">
                                    Voyage {v}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Event Selector */}
                    <div className="flex items-center gap-2 bg-ocean-800 p-1 rounded-lg border border-ocean-700 max-w-xs">
                        <div className="px-2 text-slate-400">
                            <History size={16} />
                        </div>
                        <select
                            className="bg-transparent text-sm text-white outline-none w-48 truncate"
                            value={selectedReportId || ''}
                            onChange={(e) => setSelectedReportId(e.target.value)}
                        >
                            <option value="" disabled className="bg-ocean-900 text-white">Select Event</option>
                            {displayedReports.map(r => {
                                const ev = codes?.evCodes.find(e => e.code === r.evCode)?.name || r.evCode;
                                const noonTime = r.tasks?.['T04'];
                                const dateRaw = noonTime || (r.items['R003'] as string);
                                const date = dateRaw?.replace('T', ' ') || r.submittedAt?.replace('T', ' ').substring(0, 16);
                                return (
                                    <option key={r.id} value={r.id as string} className="bg-ocean-900 text-white">
                                        {date} - {ev}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-6 flex-1 min-h-0">
                {/* Map Section */}
                <div className="bg-ocean-800 rounded-xl border border-ocean-700 overflow-hidden flex flex-col shadow-xl h-[45vh] shrink-0 w-full">
                    <div className="flex-1 relative z-0">
                        <MapContainer
                            center={[20, 120]}
                            zoom={3}
                            style={{ height: '100%', width: '100%', background: '#aadaff' }}
                        >
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                            />
                            <MapUpdater center={activePosition} />

                            {/* Voyage Path */}
                            {selectedVoyage && voyagePath.length > 1 && (
                                <Polyline
                                    positions={voyagePath.map(p => p.pos)}
                                    color="#10b981" // emerald-500
                                    weight={3}
                                    opacity={0.8}
                                    dashArray="10, 10"
                                />
                            )}

                            {/* Voyage Points (Small dots for past events) */}
                            {selectedVoyage && voyagePath.map(point => (
                                <CircleMarker
                                    key={`v-${point.id}`}
                                    center={point.pos}
                                    radius={4}
                                    pathOptions={{
                                        color: selectedReportId === point.id ? '#ef4444' : '#10b981', // Highlight selected
                                        fillColor: selectedReportId === point.id ? '#ef4444' : '#10b981',
                                        fillOpacity: 1
                                    }}
                                    eventHandlers={{
                                        click: () => setSelectedReportId(point.id)
                                    }}
                                >
                                    <Popup className="custom-popup">
                                        <div className="text-xs font-bold">{point.date}</div>
                                        <div className="text-[10px]">{point.event}</div>
                                    </Popup>
                                </CircleMarker>
                            ))}

                            {/* Active Ship Marker (Only if single report selected or no voyage selected mode?) 
                                User wants current behavior for selected report. 
                                So we keep this, but distinct.
                            */}
                            {ships.filter(s => s.code === activeShip?.code).map((ship) => {
                                const isActive = activeShip.code === ship.code;
                                const pos = isActive ? activePosition : [0, 0] as [number, number];

                                // Render large marker only for the active selected report
                                return (
                                    <Marker
                                        key={ship.code}
                                        position={pos}
                                        eventHandlers={{
                                            click: () => {
                                                setSelectedShipId(ship.code || ship.name);
                                            },
                                        }}
                                        zIndexOffset={1000}
                                    >
                                        <Popup className="custom-popup" autoPan={false}>
                                            <div className="p-2 min-w-[150px]">
                                                <h3 className="font-bold text-ocean-900 border-b border-ocean-200 pb-1 mb-1">{ship.name}</h3>
                                                {isActive && selectedReport && (
                                                    <div className="text-xs text-slate-600">
                                                        <div className="flex justify-between">
                                                            <span>Event:</span>
                                                            <span className="font-mono font-bold">{evName}</span>
                                                        </div>
                                                        <div className="flex justify-between mt-1">
                                                            <span>Date:</span>
                                                            <span className="font-mono">{selectedReport.items['R003'] as string}</span>
                                                        </div>
                                                        <div className="mt-2 text-[10px] text-slate-400">
                                                            {selectedReport.items['R006'] as string}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </Popup>
                                    </Marker>
                                );
                            })}
                        </MapContainer>
                    </div>
                </div>

                {/* Dashboard Section */}
                <div className="flex flex-col gap-4">
                    {/* Header Card */}
                    <div className="bg-ocean-800 p-6 rounded-xl border border-ocean-700 shadow-xl">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Ship className="text-primary-400" />
                                    {activeShip.name}
                                </h2>
                                <p className="text-xs text-primary-400 font-medium tracking-wider mt-1 uppercase">
                                    {selectedReport ? `EVENT: ${evName}` : 'NO EVENT SELECTED'}
                                </p>
                                <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                    <Calendar size={12} />
                                    {selectedReport ? (selectedReport.items['R003'] as string || selectedReport.submittedAt) : '-'}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 bg-ocean-900 px-3 py-1 rounded-lg border border-ocean-700">
                                <span className={cn(
                                    "w-2 h-2 rounded-full animate-pulse",
                                    speed > 0 ? "bg-green-500" : "bg-yellow-500"
                                )}></span>
                                <span className="text-xs font-medium text-slate-300">
                                    {speed > 0 ? "Underway" : "Stopped"}
                                </span>
                            </div>
                        </div>

                        {/* Top Metrics Row */}
                        <div className="grid grid-cols-4 gap-3 mb-4">
                            <MetricCard
                                icon={<Gauge className="w-5 h-5 text-cyan-400" />}
                                label="SPEED"
                                value={speed.toFixed(2)}
                                unit="Knot"
                            />
                            <MetricCard
                                icon={<Activity className="w-5 h-5 text-blue-400" />}
                                label="RPM"
                                value={rpm.toFixed(1)}
                                unit=""
                            />
                            <MetricCard
                                icon={<Navigation className="w-5 h-5 text-purple-400" />}
                                label="Distance"
                                value={distance.toFixed(1)}
                                unit="Mile"
                            />
                            <div className="bg-ocean-900/50 p-3 rounded-lg border border-ocean-700 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded bg-green-500/20 text-green-400 flex items-center justify-center font-bold">
                                        A
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-slate-400">CII</span>
                                        <span className="text-lg font-bold text-white">-/4.03</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Consumption Row */}
                        <div className="grid grid-cols-4 gap-3 mb-4">
                            <SmallMetricBox label="Total Energy" value={totalEnergy.toLocaleString(undefined, { maximumFractionDigits: 0 })} unit="MJ" icon={<Zap size={14} />} />
                            {fuelMetrics.map((f, idx) => (
                                <SmallMetricBox key={idx} label={f.name} value={f.val.toFixed(2)} unit="Ton" icon={<Droplet size={14} />} />
                            ))}
                        </div>

                        {/* Weather Row */}
                        <div className="bg-white/5 rounded-lg p-3 flex justify-between items-center text-sm border border-white/10 overflow-x-auto">
                            <WeatherItem label="Weather State" value={weather.state} />
                            <WeatherItem label="Weather B/F" value={weather.bf} />
                            <WeatherItem label="Wind-DIR" value={weather.windDir} />
                            <WeatherItem label="Wind-Force" value={weather.windForce} />
                            <WeatherItem label="Wave-DIR" value={weather.waveDir} />
                            <WeatherItem label="Wave-Force" value={weather.waveForce} />
                            <WeatherItem label="ATMOS-Temp" value={`${weather.atmosTemp || 0}°C`} />
                            <WeatherItem label="SEA-Temp" value={`${weather.seaTemp || 0}°C`} />
                        </div>
                    </div>

                    {/* Bottom Split Section */}
                    <div className="grid grid-cols-12 gap-4 flex-1">
                        {/* Left Info Column */}
                        <div className="col-span-12 lg:col-span-4 space-y-4">
                            {/* IMO Data */}
                            <div className="bg-ocean-800 p-4 rounded-xl border border-ocean-700 shadow-xl">
                                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                    <Ship className="w-4 h-4 text-slate-400" />
                                    IMO data
                                </h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">IMO NO.:</span>
                                        <span className="text-white font-mono">{activeShip.imoNo || "No Value"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">CLASS:</span>
                                        <span className="text-white">{activeShip.class}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">FLAG:</span>
                                        <span className="text-white text-right">{activeShip.flag}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Delivery:</span>
                                        <span className="text-white">{activeShip.deliveryDate}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">DWT:</span>
                                        <span className="text-white">{activeShip.dwt?.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Voyage Plan */}
                            <div className="bg-ocean-800 p-4 rounded-xl border border-ocean-700 shadow-xl">
                                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                    <Navigation className="w-4 h-4 text-slate-400" />
                                    Voyage Plan
                                </h3>
                                <div className="flex items-center justify-between bg-ocean-900/50 p-3 rounded-lg border border-ocean-700/50">
                                    <div className="text-center">
                                        <div className="text-xs text-slate-400">Voyage No</div>
                                        <div className="font-bold text-white text-lg">{voyageFrom || '-'}</div>
                                    </div>
                                    <div className="text-slate-500">→</div>
                                    <div className="text-center">
                                        <div className="text-xs text-slate-400">Next Port</div>
                                        <div className="font-bold text-white text-lg">{voyageTo || '-'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Charts Column */}
                        <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ChartCard title="Laden-GAS Trend" data={graphData} dataKey="laden" color="#3b82f6" />
                            <ChartCard title="Ballast-GAS Trend" data={graphData} dataKey="ballast" color="#3b82f6" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Helper Components

const MetricCard = ({ icon, label, value, unit }: any) => (
    <div className="bg-ocean-900/50 p-3 rounded-lg border border-ocean-700 flex flex-col relative h-[100px]">
        <div className="flex items-center gap-3 mb-2">
            <div className="p-1.5 rounded-lg bg-ocean-800 border border-ocean-700 shadow-inner text-slate-400">
                {icon}
            </div>
            <div className="text-xs text-slate-400 uppercase font-semibold">{label}</div>
        </div>
        <div className="flex-1 flex items-center justify-center">
            <span className="text-3xl font-bold text-white tracking-tight">{value}</span>
        </div>
        <div className="absolute bottom-2 right-3">
            <span className="text-xs text-slate-500 font-normal">{unit}</span>
        </div>
    </div>
);

const SmallMetricBox = ({ label, value, unit, icon }: any) => (
    <div className="bg-ocean-900/50 p-2 rounded border border-ocean-700 flex flex-col relative h-[70px]">
        <div className="flex items-center gap-1.5 mb-1">
            <span className="text-slate-400">{icon}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
            <span className="text-xl font-bold text-white tracking-tight">{value}</span>
        </div>
        <div className="absolute bottom-1.5 right-2">
            <span className="text-[10px] text-slate-500">[{unit}]</span>
        </div>
    </div>
);

const WeatherItem = ({ label, value }: any) => (
    <div className="flex flex-col items-center gap-1 min-w-[70px]">
        <span className="text-[10px] text-slate-400 whitespace-nowrap">{label}</span>
        <span className="font-bold text-white text-sm">{value || '-'}</span>
    </div>
);

const ChartCard = ({ title, data, dataKey, color }: any) => (
    <div className="bg-ocean-800 p-4 rounded-xl border border-ocean-700 shadow-xl flex flex-col h-64">
        <h3 className="text-sm font-bold text-white mb-2">{title}</h3>
        <div className="flex-1 min-h-0 bg-white/5 rounded-lg border border-white/5 p-2">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id={`color${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
                        itemStyle={{ color: '#fff' }}
                    />
                    <Area type="monotone" dataKey={dataKey} stroke={color} fillOpacity={1} fill={`url(#color${dataKey})`} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    </div>
);

export default Monitoring;
