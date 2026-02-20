import React, { useEffect, useState } from 'react';
import { fetchCodes, saveTCodes, saveRCodes, saveEVCodes } from '../api/codes';
import { fetchShips, saveShips } from '../api/ships';
import { fetchPorts, savePorts } from '../api/ports';
// import { FixedSizeList as List } from 'react-window';
import type { CodeData, Ship, Port } from '../types/index';
import { Database, Server, Ship as ShipIcon, Trash2, Plus, CheckCircle, Search, ChevronUp, ChevronDown, Filter, Box, Anchor, Activity, Zap, Droplet, Gauge } from 'lucide-react';
import { cn } from '../utils/cn';

const TabButton = ({ active, onClick, icon, label }: any) => (
    <button
        onClick={onClick}
        className={cn(
            "flex items-center gap-2 px-6 py-3 border-b-2 transition-colors",
            active
                ? "border-primary-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
        )}
    >
        {icon}
        <span className="font-medium">{label}</span>
    </button>
);

const CodeTab = ({ active, onClick, label }: any) => (
    <button
        onClick={onClick}
        className={cn(
            "flex-1 px-4 py-3 text-sm font-medium transition-colors hover:bg-ocean-700/50",
            active
                ? "bg-ocean-800 text-white border-b-2 border-primary-500"
                : "text-slate-400"
        )}
    >
        {label}
    </button>
);

const CodeTable = ({ data, columns, onDelete, onEdit, sortConfig, onSort }: { data: any[], columns: { k: string, l: string }[], onDelete?: (code: string) => void, onEdit?: (item: any) => void, sortConfig?: { key: string, direction: 'asc' | 'desc' } | null, onSort?: (key: string) => void }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left">
            <thead className="bg-ocean-900/50 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                    {columns.map(c => (
                        <th
                            key={c.k}
                            className={`px-6 py-4 font-semibold ${onSort ? 'cursor-pointer hover:text-white transition-colors' : ''}`}
                            onClick={() => onSort && onSort(c.k)}
                        >
                            <div className="flex items-center gap-1">
                                {c.l}
                                {sortConfig?.key === c.k && (
                                    sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                                )}
                            </div>
                        </th>
                    ))}
                    {(onDelete || onEdit) && <th className="px-6 py-4 font-semibold text-right">Actions</th>}
                </tr>
            </thead>
            <tbody className="divide-y divide-ocean-700">
                {data.map((row, i) => (
                    <tr key={i} className="hover:bg-ocean-700/30 transition-colors">
                        {columns.map(c => <td key={c.k} className="px-6 py-4 text-sm text-slate-300">{row[c.k]}</td>)}
                        {(onDelete || onEdit) && (
                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                {onEdit && <button onClick={() => onEdit(row)} className="text-blue-400 hover:text-blue-300">Edit</button>}
                                {onDelete && <button onClick={() => onDelete(row.code)} className="text-red-400 hover:text-red-300">Delete</button>}
                            </td>
                        )}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const InfoField = ({ label, value }: { label: string, value: any }) => (
    <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
        <div className="text-slate-200 font-medium">{value || '-'}</div>
    </div>
);

const Input = ({ value, onChange, placeholder, type = 'text' }: { value: any, onChange: (v: string) => void, placeholder: string, type?: string }) => (
    <input
        type={type}
        placeholder={placeholder}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="bg-ocean-900 border border-ocean-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:ring-2 focus:ring-primary-500 outline-none w-full"
    />
);



const Settings: React.FC = () => {
    const [codes, setCodes] = useState<CodeData | null>(null);
    const [ships, setShips] = useState<Ship[]>([]);
    const [customFields, setCustomFields] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'general' | 'events' | 'codes' | 'ships' | 'ports' | 'mePerformance' | 'gePerformance' | 'focManagement' | 'meRpmSpeed'>('general');
    const [activeCodeTab, setActiveCodeTab] = useState<'m' | 't' | 'r'>('m');
    const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Ship Management State
    const [isShipEditMode, setIsShipEditMode] = useState(false);
    const [editingShip, setEditingShip] = useState<Partial<Ship>>({});
    const [shipEditTab, setShipEditTab] = useState<'info' | 'equipment' | 'fuel' | 'lube' | 'cargo' | 'water'>('info');

    // Code Management State
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingCode, setEditingCode] = useState<any>(null);


    const [filterQuery, setFilterQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

    // Port Management State
    const [ports, setPorts] = useState<Port[]>([]);
    const [isPortEditMode, setIsPortEditMode] = useState(false);
    const [editingPort, setEditingPort] = useState<Partial<Port>>({});

    const visiblePorts = React.useMemo(() => {
        if (!ports) return [];
        if (!filterQuery) return ports;
        const lower = filterQuery.toLowerCase();
        return ports.filter(p =>
            (p.code || '').toLowerCase().includes(lower) ||
            (p.name || '').toLowerCase().includes(lower) ||
            (p.country || '').toLowerCase().includes(lower)
        );
    }, [ports, filterQuery]);

    useEffect(() => {
        setFilterQuery('');
        setSortConfig(null);
        setSelectedGroup(null);
    }, [activeTab, activeCodeTab]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filterData = (data: any[]) => {
        if (!data) return [];

        let processed = [...data];

        // 1. Filter by Query
        if (filterQuery) {
            const lowerQuery = filterQuery.toLowerCase();
            processed = processed.filter(item =>
                (item.code && item.code.toLowerCase().includes(lowerQuery)) ||
                (item.name && item.name.toLowerCase().includes(lowerQuery)) ||
                (item.description && item.description.toLowerCase().includes(lowerQuery)) ||
                (item.group && item.group.toLowerCase().includes(lowerQuery)) ||
                (item.mCode && item.mCode.toLowerCase().includes(lowerQuery))
            );
        }

        // 2. Filter by Group (for R-Codes)
        if (selectedGroup && activeCodeTab === 'r') {
            processed = processed.filter(item => item.group === selectedGroup);
        }

        // 3. Sort
        if (sortConfig) {
            processed.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
                if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return processed;
    };

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [codeData, shipData, customFieldsData, portData] = await Promise.all([
                    fetchCodes(),
                    fetchShips(),
                    fetch('http://localhost:8500/api/ship-custom-fields').then(res => res.json()),
                    fetchPorts()
                ]);
                setCodes(codeData);
                setShips(shipData);
                setCustomFields(customFieldsData);
                setPorts(portData);
            } catch (err: any) {
                console.error("Failed to load configuration", err);
                setError(err.message || "Failed to load configuration data.");
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    // ... (handleShipSelect, handleDeleteShip, openShipEdit, handleSaveShip)

    // Port Handlers
    const openPortEdit = (port?: Port) => {
        if (port) {
            setEditingPort({ ...port });
        } else {
            setEditingPort({ code: '', name: '', country: '' });
        }
        setIsPortEditMode(true);
    };

    const handleSavePort = async () => {
        if (!editingPort.code || !editingPort.name) {
            alert('Port Code and Name are required');
            return;
        }

        // Check for duplicates (by Code)
        // const isNew = !ports.some(p => p.code === editingPort.code);
        // Warning: This simple logic assumes Code is the primary key and doesn't allow editing Code of existing port if it creates a conflict, 
        // or rather, if we edit a Port, we match by Code. If code is editable, we might need a separate ID. 
        // For simplicity, we'll assume Code is unique ID. If editing existing, we update list.

        // Actually, if editing an existing port, we likely want to allow Code change only if it doesn't conflict.
        // But simpler: Filter out the "old" version if it exists? 
        // We don't have a stable ID here. Let's assume Code is the ID.
        // If we are "Editing", we should know which one we are editing.
        // Let's rely on the user not to create duplicate codes or handle it simply:

        let updatedPorts = [...ports];
        // If we are in "Edit Mode" and we have an original code? 
        // Let's just filter out by code if it matches current editing code (Update) or just push if new?
        // Better: Remove any existing port with the SAME code (Update) or just add.

        // Issue: If I change the code of a port, I need to know the OLD code to remove it.
        // Since we don't track "original code" in `editingPort`, let's assume Code is immutable or we just Upsert by Code.
        // "Add/Edit" usually implies Upsert.

        updatedPorts = updatedPorts.filter(p => p.code !== editingPort.code);
        updatedPorts.push(editingPort as Port);
        updatedPorts.sort((a, b) => a.code.localeCompare(b.code));

        try {
            await savePorts(updatedPorts);
            setPorts(updatedPorts);
            setIsPortEditMode(false);
            setEditingPort({});
        } catch (err) {
            console.error("Failed to save port", err);
            alert("Failed to save port");
        }
    };

    const handleDeletePort = async (code: string) => {
        if (!confirm('Are you sure you want to delete this port?')) return;
        const updated = ports.filter(p => p.code !== code);
        try {
            await savePorts(updated);
            setPorts(updated);
        } catch (err) {
            console.error("Failed to delete port", err);
            alert("Failed to delete port");
        }
    };

    const handleShipSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const ship = ships.find(s => s.code === e.target.value);
        setSelectedShip(ship || null);
    };

    const handleDeleteShip = async (code: string) => {
        if (!confirm('Are you sure you want to delete this ship?')) return;
        const updated = ships.filter(s => s.code !== code);
        await saveShips(updated);
        setShips(updated);
        if (selectedShip?.code === code) setSelectedShip(null);
    };

    const openShipEdit = (ship?: Ship) => {
        if (ship) {
            setEditingShip(JSON.parse(JSON.stringify(ship))); // Deep copy
        } else {
            setEditingShip({
                code: '', name: '', yard: '', hullNo: '', imoNo: '', class: '', flag: '', cargo: '', dwt: 0,
                equipment: [], fuels: [], lubeOils: [], customValues: {}
            });
        }
        setShipEditTab('info');
        setIsShipEditMode(true);
    };

    const handleSaveShip = async () => {
        if (!editingShip.name || !editingShip.code) {
            alert('Name and Code are required');
            return;
        }

        const updatedShips = ships.filter(s => s.code !== editingShip.code);
        updatedShips.push(editingShip as Ship);
        // Sort by name or code if needed, for now just append/update

        try {
            await saveShips(updatedShips);
            setShips(updatedShips);
            setIsShipEditMode(false);
            setEditingShip({});
        } catch (err) {
            console.error("Failed to save ship", err);
            alert("Failed to save ship configuration");
        }
    };

    const generateNextCode = (prefix: string, list: any[]) => {
        if (!list) return '';
        const regex = new RegExp(`^${prefix}(\\d+)$`);
        let maxId = 0;
        list.forEach(item => {
            const match = item.code.match(regex);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxId) maxId = num;
            }
        });
        const nextId = maxId + 1;
        return `${prefix}${nextId.toString().padStart(2, '0')}`;
    };

    const openEdit = (item?: any, type: 'ev' | 'code' = 'code') => {
        if (type === 'ev') {
            setEditingCode(item || { code: '', name: '', priority: 0, mCode: 'M01', validTCodes: [], validRCodes: [], description: '' });
        } else {
            if (item) {
                setEditingCode(item);
            } else {
                let nextCode = '';
                if (codes) {
                    if (activeCodeTab === 't') {
                        nextCode = generateNextCode('T', codes.tCodes);
                    } else if (activeCodeTab === 'r') {
                        nextCode = generateNextCode('R', codes.rCodes);
                    }
                }
                setEditingCode({ code: nextCode, name: '', priority: 0, unit: '' });
            }
        }
        setIsEditMode(true);
    };

    // ... (handleSaveCode, handleDeleteCode logic remains same)
    const handleSaveCode = async () => {
        if (!codes || !editingCode) return;
        if (!editingCode.code || !editingCode.name) {
            alert("Code and Name are required");
            return;
        }

        try {
            if (activeTab === 'events') {
                const updatedList = codes.evCodes.filter(c => c.code !== editingCode.code);
                updatedList.push({
                    code: editingCode.code,
                    name: editingCode.name,
                    mCode: editingCode.mCode || 'M01',
                    description: editingCode.description || '',
                    priority: Number(editingCode.priority) || 0,
                    validTCodes: editingCode.validTCodes || [],
                    validRCodes: editingCode.validRCodes || []
                });
                updatedList.sort((a, b) => (a.priority || 0) - (b.priority || 0));

                await saveEVCodes(updatedList);
                setCodes({ ...codes, evCodes: updatedList });
            } else if (activeCodeTab === 't') {
                const updatedList = codes.tCodes.filter(c => c.code !== editingCode.code);
                updatedList.push({
                    code: editingCode.code,
                    name: editingCode.name,
                    description: editingCode.description || '',
                    priority: Number(editingCode.priority) || 0,
                    unit: editingCode.unit || ''
                });
                updatedList.sort((a, b) => (a.priority || 0) - (b.priority || 0));

                await saveTCodes(updatedList);
                setCodes({ ...codes, tCodes: updatedList });
            } else if (activeCodeTab === 'r') {
                const updatedList = codes.rCodes.filter(c => c.code !== editingCode.code);
                updatedList.push({
                    code: editingCode.code,
                    name: editingCode.name,
                    type: editingCode.type || 'number',
                    unit: editingCode.unit || '',
                    priority: Number(editingCode.priority) || 0,
                    group: editingCode.group || ''
                });
                updatedList.sort((a, b) => (a.priority || 0) - (b.priority || 0));

                await saveRCodes(updatedList);
                setCodes({ ...codes, rCodes: updatedList });
            }
            setIsEditMode(false);
            setEditingCode(null);
        } catch (error) {
            console.error("Failed to save code", error);
            alert("Failed to save changes");
        }
    };

    const handleDeleteCode = async (code: string) => {
        if (!codes || !confirm("Delete this code?")) return;

        try {
            if (activeTab === 'events') {
                const updatedList = codes.evCodes.filter(c => c.code !== code);
                await saveEVCodes(updatedList);
                setCodes({ ...codes, evCodes: updatedList });
            } else if (activeCodeTab === 't') {
                const updatedList = codes.tCodes.filter(c => c.code !== code);
                await saveTCodes(updatedList);
                setCodes({ ...codes, tCodes: updatedList });
            } else if (activeCodeTab === 'r') {
                const updatedList = codes.rCodes.filter(c => c.code !== code);
                await saveRCodes(updatedList);
                setCodes({ ...codes, rCodes: updatedList });
            }
        } catch (error) {
            console.error("Failed to delete code", error);
            alert("Failed to delete code");
        }
    };

    const toggleEquipment = (eCode: string, installed: boolean) => {
        let currentEq = [...(editingShip.equipment || [])];
        if (installed) {
            if (!currentEq.find(e => e.code === eCode)) {
                // Default to ALL currently configured fuels when enabling equipment
                // This improves UX by not requiring user to manually check all fuels if they apply
                const allFuelCodes = editingShip.fuels?.map(f => f.code) || [];
                currentEq.push({ code: eCode, installed: true, count: 1, validFuels: allFuelCodes });
            }
        } else {
            currentEq = currentEq.filter(e => e.code !== eCode);
        }
        setEditingShip({ ...editingShip, equipment: currentEq });
    };

    const updateEquipmentCount = (eCode: string, count: number) => {
        let currentEq = [...(editingShip.equipment || [])];
        const idx = currentEq.findIndex(e => e.code === eCode);
        if (idx >= 0) {
            currentEq[idx] = { ...currentEq[idx], count };
            setEditingShip({ ...editingShip, equipment: currentEq });
        }
    };

    const toggleFuel = (code: string) => {
        if (!editingShip.fuels) {
            setEditingShip({ ...editingShip, fuels: [{ code, initialRob: 0 }] });
            return;
        }
        const exists = editingShip.fuels.some(f => f.code === code);
        if (exists) {
            setEditingShip({
                ...editingShip,
                fuels: editingShip.fuels.filter(f => f.code !== code)
            });
        } else {
            setEditingShip({
                ...editingShip,
                fuels: [...editingShip.fuels, { code, initialRob: 0 }]
            });
        }
    };

    const updateFuelRob = (code: string, value: string) => {
        const numVal = parseFloat(value) || 0;
        const currentFuels = editingShip.fuels || [];
        if (currentFuels.some(f => f.code === code)) {
            setEditingShip({
                ...editingShip,
                fuels: currentFuels.map(f => f.code === code ? { ...f, initialRob: numVal } : f)
            });
        } else {
            setEditingShip({
                ...editingShip,
                fuels: [...currentFuels, { code, initialRob: numVal }]
            });
        }
    };

    const updateFuelLcv = (code: string, value: string) => {
        const numVal = parseFloat(value) || 0;
        const currentFuels = editingShip.fuels || [];
        if (currentFuels.some(f => f.code === code)) {
            setEditingShip({
                ...editingShip,
                fuels: currentFuels.map(f => f.code === code ? { ...f, lcv: numVal } : f)
            });
        } else {
            setEditingShip({
                ...editingShip,
                fuels: [...currentFuels, { code, initialRob: 0, lcv: numVal }]
            });
        }
    };

    const toggleLube = (code: string) => {
        if (!editingShip.lubeOils) {
            setEditingShip({ ...editingShip, lubeOils: [{ code, initialRob: 0 }] });
            return;
        }
        const exists = editingShip.lubeOils.some(l => l.code === code);
        if (exists) {
            setEditingShip({
                ...editingShip,
                lubeOils: editingShip.lubeOils.filter(l => l.code !== code)
            });
        } else {
            setEditingShip({
                ...editingShip,
                lubeOils: [...editingShip.lubeOils, { code, initialRob: 0 }]
            });
        }
    };

    const updateLubeRob = (code: string, value: string) => {
        const numVal = parseFloat(value) || 0;
        const currentLubes = editingShip.lubeOils || [];
        if (currentLubes.some(l => l.code === code)) {
            setEditingShip({
                ...editingShip,
                lubeOils: currentLubes.map(l => l.code === code ? { ...l, initialRob: numVal } : l)
            });
        } else {
            setEditingShip({
                ...editingShip,
                lubeOils: [...currentLubes, { code, initialRob: numVal }]
            });
        }
    };

    const toggleWater = (code: string) => {
        if (!editingShip.waters) {
            setEditingShip({ ...editingShip, waters: [{ code, initialRob: 0 }] });
            return;
        }
        const exists = editingShip.waters.some(w => w.code === code);
        if (exists) {
            setEditingShip({
                ...editingShip,
                waters: editingShip.waters.filter(w => w.code !== code)
            });
        } else {
            setEditingShip({
                ...editingShip,
                waters: [...editingShip.waters, { code, initialRob: 0 }]
            });
        }
    };

    const updateWaterRob = (code: string, value: string) => {
        const numVal = parseFloat(value) || 0;
        const currentWaters = editingShip.waters || [];
        if (currentWaters.some(w => w.code === code)) {
            setEditingShip({
                ...editingShip,
                waters: currentWaters.map(w => w.code === code ? { ...w, initialRob: numVal } : w)
            });
        } else {
            setEditingShip({
                ...editingShip,
                waters: [...currentWaters, { code, initialRob: numVal }]
            });
        }
    };

    // Helper for rendering the checkbox list with inputs
    const renderConfigList = (
        allCodes: any[],
        selected: { code: string; initialRob?: number; lcv?: number }[] | undefined,
        toggle: (code: string) => void,
        updateRob: (code: string, val: string) => void,
        isInherited: boolean = false,
        updateLcv?: (code: string, val: string) => void
    ) => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allCodes.map(c => {
                const item = selected?.find(s => s.code === c.code);
                const isChecked = !!item;
                return (
                    <div key={c.code} className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${isChecked ? 'bg-primary-500/10 border-primary-500/50' : 'bg-ocean-900/50 border-ocean-700/50 hover:border-primary-500/30'}`}>
                        <div
                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isInherited ? 'cursor-not-allowed border-slate-600 bg-slate-800' : 'cursor-pointer hover:border-primary-400'} ${isChecked ? 'bg-primary-500 border-primary-500' : 'border-ocean-600'}`}
                            onClick={() => !isInherited && toggle(c.code)}
                        >
                            {isChecked && <CheckCircle size={14} className="text-white" />}
                        </div>
                        <div className="flex-1">
                            <div className="font-bold text-white">{c.name}</div>
                            <div className="text-xs text-slate-500">{c.code}</div>
                        </div>
                        {isChecked && (
                            <div className="flex gap-2">
                                <div className="flex flex-col items-end gap-1">
                                    <label className="text-[10px] uppercase font-bold text-primary-400">Initial ROB</label>
                                    <input
                                        type="number"
                                        className="w-24 bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-right text-white text-sm focus:border-primary-500 outline-none"
                                        value={item?.initialRob ?? ''}
                                        onChange={(e) => updateRob(c.code, e.target.value)}
                                        placeholder="0.0"
                                    />
                                </div>
                                {updateLcv && (
                                    <div className="flex flex-col items-end gap-1">
                                        <label className="text-[10px] uppercase font-bold text-emerald-400">LCV (TJ/Ton)</label>
                                        <input
                                            type="number"
                                            className="w-24 bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-right text-white text-sm focus:border-emerald-500 outline-none"
                                            value={item?.lcv ?? ''}
                                            onChange={(e) => updateLcv(c.code, e.target.value)}
                                            placeholder="0.0"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    // Helper for Labeled Input
    const LabeledInput = ({ label, value, onChange, placeholder, type = 'text' }: { label: string, value: any, onChange: (v: string) => void, placeholder?: string, type?: string }) => (
        <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
            <Input value={value} onChange={onChange} placeholder={placeholder || ''} type={type} />
        </div>
    );

    if (isLoading) return <div className="text-white p-8">Loading configuration...</div>;

    if (error) {
        return (
            <div className="text-white p-8">
                <div className="text-red-400 text-xl font-bold mb-4">Error Loading Configuration</div>
                <p className="text-slate-300 mb-4">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!codes) return <div className="text-white p-8">No configuration data available.</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">System Settings</h1>
                    <p className="text-slate-400 mt-1">Manage vessel configuration and system codes.</p>
                </div>
            </header>

            {/* Main Tabs */}
            <div className="flex gap-4 border-b border-ocean-700 flex-wrap">
                <TabButton
                    active={activeTab === 'general'}
                    onClick={() => setActiveTab('general')}
                    icon={<Server size={18} />}
                    label="General Configuration"
                />
                <TabButton
                    active={activeTab === 'ships'}
                    onClick={() => setActiveTab('ships')}
                    icon={<ShipIcon size={18} />}
                    label="Ship Management"
                />
                <TabButton
                    active={activeTab === 'events'}
                    onClick={() => setActiveTab('events')}
                    icon={<Database size={18} />}
                    label="Event Report Management"
                />
                <TabButton
                    active={activeTab === 'codes'}
                    onClick={() => setActiveTab('codes')}
                    icon={<Database size={18} />}
                    label="Code Management"
                />
                <TabButton
                    active={activeTab === 'ports'}
                    onClick={() => setActiveTab('ports')}
                    icon={<Anchor size={18} />}
                    label="Port Management"
                />
                <TabButton
                    active={activeTab === 'mePerformance'}
                    onClick={() => setActiveTab('mePerformance')}
                    icon={<Activity size={18} />}
                    label="M/E Performance"
                />
                <TabButton
                    active={activeTab === 'gePerformance'}
                    onClick={() => setActiveTab('gePerformance')}
                    icon={<Zap size={18} />}
                    label="Generator Performance"
                />
                <TabButton
                    active={activeTab === 'focManagement'}
                    onClick={() => setActiveTab('focManagement')}
                    icon={<Droplet size={18} />}
                    label="FOC Management"
                />
                <TabButton
                    active={activeTab === 'meRpmSpeed'}
                    onClick={() => setActiveTab('meRpmSpeed')}
                    icon={<Gauge size={18} />}
                    label="M/E RPM-Speed"
                />
            </div>

            {/* General Configuration Tab */}
            {activeTab === 'general' && (
                <div className="bg-ocean-800 rounded-2xl p-8 border border-ocean-700 max-w-2xl">
                    <div className="flex items-center gap-4 mb-6 text-primary-400">
                        <ShipIcon size={32} />
                        <h2 className="text-2xl font-bold text-white">Vessel Information</h2>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Select Vessel</label>
                            <select
                                className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-primary-500"
                                onChange={handleShipSelect}
                                value={selectedShip?.code || ''}
                            >
                                <option value="">-- Select a Ship --</option>
                                {ships.map(ship => (
                                    <option key={ship.code} value={ship.code}>
                                        {ship.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedShip && (
                            <div className="space-y-8">
                                <div className="grid grid-cols-2 gap-6 bg-ocean-900/30 p-4 rounded-xl border border-ocean-700/50">
                                    <InfoField label="Vessel Name" value={selectedShip.name} />
                                    <InfoField label="Ship Code" value={selectedShip.code} />
                                    <InfoField label="Yard" value={selectedShip.yard} />
                                    <InfoField label="Hull No" value={selectedShip.hullNo} />
                                    <InfoField label="IMO No" value={selectedShip.imoNo} />
                                    <InfoField label="Class" value={selectedShip.class} />
                                    <InfoField label="Flag" value={selectedShip.flag} />
                                    <InfoField label="DWT" value={selectedShip.dwt?.toLocaleString()} />
                                    <InfoField label="Delivery" value={selectedShip.deliveryDate} />
                                    {customFields.map((field) => (
                                        <InfoField key={field} label={field} value={selectedShip.customValues?.[field] || '-'} />
                                    ))}
                                </div>

                                <div className="pt-6 border-t border-ocean-700">
                                    <h3 className="text-xl font-bold text-white mb-4">Event Report Configuration Source</h3>
                                    <div className="bg-ocean-900/30 p-6 rounded-xl border border-ocean-700/50 space-y-4">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                id="inheritConfig"
                                                className="w-5 h-5 rounded border-ocean-600 bg-ocean-900 text-primary-500 focus:ring-primary-500 cursor-pointer"
                                                checked={!!selectedShip.configSourceShipId}
                                                onChange={async (e) => {
                                                    if (!e.target.checked) {
                                                        // Disable inheritance
                                                        const updated = { ...selectedShip, configSourceShipId: undefined };
                                                        const newShips = ships.map(s => s.code === selectedShip.code ? updated : s);
                                                        await saveShips(newShips);
                                                        setShips(newShips);
                                                        setSelectedShip(updated);
                                                    } else {
                                                        // Enable inheritance (default to first available or require selection)
                                                        if (ships.length > 1) {
                                                            const firstOther = ships.find(s => s.code !== selectedShip.code);
                                                            if (firstOther) {
                                                                const updated = { ...selectedShip, configSourceShipId: firstOther.code };
                                                                const newShips = ships.map(s => s.code === selectedShip.code ? updated : s);
                                                                await saveShips(newShips);
                                                                setShips(newShips);
                                                                setSelectedShip(updated);
                                                            } else {
                                                                alert("No other ships available to inherit from.");
                                                            }
                                                        } else {
                                                            alert("No other ships available to inherit from.");
                                                        }
                                                    }
                                                }}
                                            />
                                            <label htmlFor="inheritConfig" className="text-slate-200 font-medium cursor-pointer">
                                                Inherit configuration from another vessel
                                            </label>
                                        </div>

                                        {selectedShip.configSourceShipId && (
                                            <div className="pl-8 animate-in slide-in-from-top-2">
                                                <label className="block text-sm font-medium text-slate-400 mb-2">Select Source Vessel</label>
                                                <div className="flex gap-4">
                                                    <select
                                                        className="flex-1 bg-ocean-900 border border-ocean-600 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-primary-500"
                                                        value={selectedShip.configSourceShipId}
                                                        onChange={async (e) => {
                                                            const val = e.target.value;
                                                            const updated = { ...selectedShip, configSourceShipId: val };
                                                            const newShips = ships.map(s => s.code === selectedShip.code ? updated : s);
                                                            await saveShips(newShips);
                                                            setShips(newShips);
                                                            setSelectedShip(updated);
                                                        }}
                                                    >
                                                        {ships.filter(s => s.code !== selectedShip.code).map(s => (
                                                            <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <p className="text-sm text-slate-500 mt-2">
                                                    Equipment, Fuels, Lube Oils, Waters, and Tank configurations will be used from the selected vessel.
                                                    <br />
                                                    <span className="text-amber-400">Note:</span> Editing these configurations for <strong>{selectedShip.name}</strong> will be disabled.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Ship Management Tab */}
            {activeTab === 'ships' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-white">Registered Ships</h2>
                        <button onClick={() => openShipEdit(undefined)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2">
                            <Plus size={18} /> Add New Ship
                        </button>
                    </div>

                    {/* Ship List */}
                    <div className="bg-ocean-800 rounded-2xl border border-ocean-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-ocean-900/50 text-slate-400 text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Code</th>
                                        <th className="px-6 py-4">Name</th>
                                        <th className="px-6 py-4">Yard</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-ocean-700">
                                    {ships.map((ship) => (
                                        <tr key={ship.code} className="hover:bg-ocean-700/30 transition-colors">
                                            <td className="px-6 py-4 font-mono text-primary-400">{ship.code}</td>
                                            <td className="px-6 py-4 font-medium text-white">{ship.name}</td>
                                            <td className="px-6 py-4 text-slate-400">{ship.yard}</td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                <button onClick={() => openShipEdit(ship)} className="text-blue-400 hover:text-blue-300 p-2">Edit</button>
                                                <button onClick={() => handleDeleteShip(ship.code)} className="text-red-400 hover:text-red-300 p-2">
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Ship Edit Modal */}
                    {isShipEditMode && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                            <div className="bg-ocean-800 rounded-2xl border border-ocean-700 w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">
                                <div className="p-6 border-b border-ocean-700 flex justify-between items-center">
                                    <h2 className="text-2xl font-bold text-white">{editingShip.code ? 'Edit Ship' : 'Add New Ship'}</h2>
                                    <button onClick={() => setIsShipEditMode(false)} className="text-slate-400 hover:text-white">✕</button>
                                </div>

                                <div className="flex border-b border-ocean-700 px-6">
                                    {['info', 'equipment', 'fuel', 'lube', 'cargo', 'water'].map((tab: any) => (
                                        <button
                                            key={tab}
                                            onClick={() => setShipEditTab(tab)}
                                            className={cn(
                                                "px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize",
                                                shipEditTab === tab ? "border-primary-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
                                            )}
                                        >
                                            {tab === 'lube' ? 'Lube Oil' : tab}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex-1 overflow-y-auto p-6">
                                    {/* Helper for inheritance check */}
                                    {(() => {
                                        const sourceShip = editingShip.configSourceShipId ? ships.find(s => s.code === editingShip.configSourceShipId) : null;
                                        const isInherited = !!sourceShip;

                                        return (
                                            <>
                                                {shipEditTab === 'info' && (
                                                    <>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                            <LabeledInput label="Yard" placeholder="Yard" value={editingShip.yard} onChange={v => setEditingShip({ ...editingShip, yard: v })} />
                                                            <LabeledInput label="Hull No" placeholder="Hull No" value={editingShip.hullNo} onChange={v => setEditingShip({ ...editingShip, hullNo: v })} />
                                                            <LabeledInput label="IMO No" placeholder="IMO No" value={editingShip.imoNo} onChange={v => setEditingShip({ ...editingShip, imoNo: v })} />
                                                            <LabeledInput label="Vessel Name" placeholder="Ship Name" value={editingShip.name} onChange={v => setEditingShip({ ...editingShip, name: v })} />
                                                            <LabeledInput label="Ship Code" placeholder="Code" value={editingShip.code} onChange={v => setEditingShip({ ...editingShip, code: v })} />
                                                            <LabeledInput label="Class" placeholder="Class" value={editingShip.class} onChange={v => setEditingShip({ ...editingShip, class: v })} />
                                                            <LabeledInput label="Flag" placeholder="Flag" value={editingShip.flag} onChange={v => setEditingShip({ ...editingShip, flag: v })} />
                                                            <LabeledInput label="Delivery Date" placeholder="Delivery Date" type="date" value={editingShip.deliveryDate} onChange={v => setEditingShip({ ...editingShip, deliveryDate: v })} />
                                                            <LabeledInput label="Cargo Type" placeholder="Cargo" value={editingShip.cargo} onChange={v => setEditingShip({ ...editingShip, cargo: v })} />
                                                            <LabeledInput label="DWT" placeholder="DWT" type="number" value={editingShip.dwt?.toString()} onChange={v => setEditingShip({ ...editingShip, dwt: Number(v) })} />
                                                        </div>

                                                        <div className="mt-8 border-t border-ocean-700 pt-6">
                                                            <div className="flex justify-between items-center mb-4">
                                                                <h3 className="text-lg font-bold text-white">Additional Information (Global)</h3>
                                                                <button
                                                                    onClick={async () => {
                                                                        const newLabel = prompt("Enter new field name:");
                                                                        if (newLabel && !customFields.includes(newLabel)) {
                                                                            const updatedFields = [...customFields, newLabel];
                                                                            setCustomFields(updatedFields);
                                                                            await fetch('http://localhost:8500/api/ship-custom-fields', {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json' },
                                                                                body: JSON.stringify(updatedFields)
                                                                            });
                                                                        }
                                                                    }}
                                                                    className="text-sm bg-ocean-700 hover:bg-ocean-600 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                                                >
                                                                    <Plus size={14} /> Add Global Field
                                                                </button>
                                                            </div>
                                                            <div className="space-y-3">
                                                                {customFields.map((field) => (
                                                                    <div key={field} className="flex gap-4 items-end animate-in slide-in-from-top-1">
                                                                        <div className="flex-1">
                                                                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{field}</label>
                                                                            <div className="bg-ocean-900/50 border border-ocean-700 rounded-lg px-4 py-2 text-slate-400 cursor-not-allowed">
                                                                                {field}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <LabeledInput
                                                                                label="Value"
                                                                                placeholder="Value"
                                                                                value={editingShip.customValues?.[field] || ''}
                                                                                onChange={(v) => {
                                                                                    const newValues = { ...(editingShip.customValues || {}), [field]: v };
                                                                                    setEditingShip({ ...editingShip, customValues: newValues });
                                                                                }}
                                                                            />
                                                                        </div>
                                                                        <button
                                                                            onClick={async () => {
                                                                                if (confirm(`Delete field "${field}" from ALL ships?`)) {
                                                                                    const updatedFields = customFields.filter(f => f !== field);
                                                                                    setCustomFields(updatedFields);
                                                                                    await fetch('http://localhost:8500/api/ship-custom-fields', {
                                                                                        method: 'POST',
                                                                                        headers: { 'Content-Type': 'application/json' },
                                                                                        body: JSON.stringify(updatedFields)
                                                                                    });
                                                                                }
                                                                            }}
                                                                            className="h-[58px] px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 transition-colors flex items-center justify-center"
                                                                        >
                                                                            <Trash2 size={18} />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                                {customFields.length === 0 && (
                                                                    <div className="text-sm text-slate-500 italic p-4 bg-ocean-900/30 rounded-lg border border-ocean-800 text-center">
                                                                        No global custom fields defined. Add one to start.
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}


                                                {shipEditTab === 'equipment' && (
                                                    <div className="space-y-4">
                                                        {isInherited && (
                                                            <div className="bg-ocean-900/50 border border-ocean-700 p-3 rounded-lg flex items-center gap-2 text-sm text-yellow-400 mb-4">
                                                                <Server size={16} />
                                                                <span>Equipment list is inherited from {sourceShip?.name}. Cannot verify or change structure here.</span>
                                                            </div>
                                                        )}
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left">
                                                                <thead className="text-xs uppercase text-slate-400 border-b border-ocean-700">
                                                                    <tr>
                                                                        <th className="pb-2">Equipment</th>
                                                                        <th className="pb-2">Installed (Y/N)</th>
                                                                        <th className="pb-2">Number</th>
                                                                        <th className="pb-2">Valid Fuels</th>
                                                                        <th className="pb-2">Usage</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-ocean-700/50">
                                                                    {codes?.eCodes?.map(e => {
                                                                        // If inherited, use source ship's equipment config for display
                                                                        // Otherwise use editingShip's
                                                                        const effectiveEquipment = isInherited ? sourceShip?.equipment : editingShip.equipment;
                                                                        const eqConfig = effectiveEquipment?.find(eq => eq.code === e.code);

                                                                        // Helper to toggle a fuel for this equipment
                                                                        const toggleEqFuel = (fCode: string, checked: boolean) => {
                                                                            if (isInherited) return; // Prevent edit if inherited
                                                                            let currentEq = [...(editingShip.equipment || [])];
                                                                            const idx = currentEq.findIndex(eq => eq.code === e.code);
                                                                            if (idx >= 0) {
                                                                                const currentFuels = currentEq[idx].validFuels || [];
                                                                                const newFuels = checked
                                                                                    ? [...currentFuels, fCode]
                                                                                    : currentFuels.filter(f => f !== fCode);

                                                                                currentEq[idx] = { ...currentEq[idx], validFuels: newFuels };
                                                                                setEditingShip({ ...editingShip, equipment: currentEq });
                                                                            }
                                                                        };

                                                                        return (
                                                                            <tr key={e.code} className={isInherited ? "opacity-70" : ""}>
                                                                                <td className="py-3 text-white">
                                                                                    <span className="font-bold">{e.code}</span> - {e.name}
                                                                                </td>
                                                                                <td className="py-3">
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        className="w-5 h-5 rounded border-slate-600 bg-ocean-900 text-primary-500"
                                                                                        checked={!!eqConfig}
                                                                                        onChange={(ev) => !isInherited && toggleEquipment(e.code, ev.target.checked)}
                                                                                        disabled={isInherited}
                                                                                    />
                                                                                </td>
                                                                                <td className="py-3">
                                                                                    {eqConfig && (
                                                                                        <input
                                                                                            type="number"
                                                                                            className="w-20 bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-white disabled:text-slate-500"
                                                                                            value={eqConfig.count}
                                                                                            onChange={(ev) => !isInherited && updateEquipmentCount(e.code, Number(ev.target.value))}
                                                                                            min={0}
                                                                                            disabled={isInherited}
                                                                                        />
                                                                                    )}
                                                                                </td>
                                                                                <td className="py-3">
                                                                                    {eqConfig && (
                                                                                        <div className="flex flex-wrap gap-2">
                                                                                            {/* Use Effective Fuels list for display */}
                                                                                            {(isInherited ? sourceShip?.fuels : editingShip.fuels)?.map(shipFuel => {
                                                                                                // Find name from codes
                                                                                                const fuelName = codes.fCodes.find(f => f.code === shipFuel.code)?.name || shipFuel.code;
                                                                                                const isSelected = eqConfig.validFuels?.includes(shipFuel.code);

                                                                                                return (
                                                                                                    <label key={shipFuel.code} className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition-colors ${isSelected ? 'bg-primary-500/20 border-primary-500/50 text-white' : 'bg-ocean-900 border-ocean-700 text-slate-400'} ${!isInherited ? 'cursor-pointer hover:border-slate-500' : ''}`}>
                                                                                                        <input
                                                                                                            type="checkbox"
                                                                                                            className="hidden"
                                                                                                            checked={!!isSelected}
                                                                                                            onChange={(ev) => !isInherited && toggleEqFuel(shipFuel.code, ev.target.checked)}
                                                                                                            disabled={isInherited}
                                                                                                        />
                                                                                                        <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-primary-400' : 'bg-slate-600'}`}></div>
                                                                                                        {fuelName}
                                                                                                    </label>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    )}
                                                                                </td>
                                                                                <td className="py-3 text-slate-400 text-sm">{e.numberRange}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}

                                                {shipEditTab === 'fuel' && (
                                                    <div className="space-y-4">
                                                        {isInherited && (
                                                            <div className="bg-ocean-900/50 border border-ocean-700 p-3 rounded-lg flex items-center gap-2 text-sm text-blue-300">
                                                                <Server size={16} />
                                                                <span>Fuel Types are inherited from {sourceShip?.name}. You can only edit ROB values.</span>
                                                            </div>
                                                        )}
                                                        {renderConfigList(
                                                            codes?.fCodes || [],
                                                            isInherited
                                                                ? sourceShip?.fuels?.map(src => ({
                                                                    code: src.code,
                                                                    initialRob: editingShip.fuels?.find(t => t.code === src.code)?.initialRob ?? 0,
                                                                    lcv: editingShip.fuels?.find(t => t.code === src.code)?.lcv ?? 0
                                                                }))
                                                                : editingShip.fuels,
                                                            toggleFuel,
                                                            updateFuelRob,
                                                            isInherited,
                                                            updateFuelLcv
                                                        )}
                                                    </div>
                                                )}

                                                {shipEditTab === 'lube' && (
                                                    <div className="space-y-4">
                                                        {isInherited && (
                                                            <div className="bg-ocean-900/50 border border-ocean-700 p-3 rounded-lg flex items-center gap-2 text-sm text-blue-300">
                                                                <Server size={16} />
                                                                <span>Lube Oil Types are inherited from {sourceShip?.name}. You can only edit ROB values.</span>
                                                            </div>
                                                        )}
                                                        {renderConfigList(
                                                            codes?.lCodes || [],
                                                            isInherited
                                                                ? sourceShip?.lubeOils?.map(src => ({
                                                                    code: src.code,
                                                                    initialRob: editingShip.lubeOils?.find(t => t.code === src.code)?.initialRob ?? 0
                                                                }))
                                                                : editingShip.lubeOils,
                                                            toggleLube,
                                                            updateLubeRob,
                                                            isInherited
                                                        )}
                                                    </div>
                                                )}

                                                {shipEditTab === 'water' && (
                                                    <div className="space-y-4">
                                                        {isInherited && (
                                                            <div className="bg-ocean-900/50 border border-ocean-700 p-3 rounded-lg flex items-center gap-2 text-sm text-blue-300">
                                                                <Server size={16} />
                                                                <span>Water Types are inherited from {sourceShip?.name}. You can only edit ROB values.</span>
                                                            </div>
                                                        )}
                                                        {renderConfigList(
                                                            codes?.wCodes || [],
                                                            isInherited
                                                                ? sourceShip?.waters?.map(src => ({
                                                                    code: src.code,
                                                                    initialRob: editingShip.waters?.find(t => t.code === src.code)?.initialRob ?? 0
                                                                }))
                                                                : editingShip.waters,
                                                            toggleWater,
                                                            updateWaterRob,
                                                            isInherited
                                                        )}
                                                    </div>
                                                )}

                                                {shipEditTab === 'cargo' && (
                                                    <div className="overflow-x-auto p-4">
                                                        {isInherited && (
                                                            <div className="bg-ocean-900/50 border border-ocean-700 p-3 rounded-lg flex items-center gap-2 text-sm text-yellow-400 mb-4">
                                                                <Server size={16} />
                                                                <span>Tank configuration is inherited from {sourceShip?.name}. Cannot change.</span>
                                                            </div>
                                                        )}
                                                        <table className={cn("w-full text-left", isInherited && "opacity-70 pointer-events-none")}>
                                                            <thead className="text-xs uppercase text-slate-400 border-b border-ocean-700">
                                                                <tr>
                                                                    <th className="pb-2">Equipment</th>
                                                                    <th className="pb-2">Installed (Y/N)</th>
                                                                    <th className="pb-2">Number</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-ocean-700/50">
                                                                {/* Cargo Tank Row */}
                                                                <tr>
                                                                    <td className="py-3 text-white">
                                                                        <div className="flex items-center gap-2">
                                                                            <Box size={18} className="text-primary-400" />
                                                                            <span className="font-bold">Cargo Tank</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-3">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="w-5 h-5 rounded border-slate-600 bg-ocean-900 text-primary-500 cursor-pointer"
                                                                            checked={((isInherited ? sourceShip?.tankCounts?.cargo : editingShip.tankCounts?.cargo) || 0) > 0}
                                                                            onChange={(e) => {
                                                                                setEditingShip({
                                                                                    ...editingShip,
                                                                                    tankCounts: {
                                                                                        ...editingShip.tankCounts,
                                                                                        cargo: e.target.checked ? 1 : 0,
                                                                                        ballast: editingShip.tankCounts?.ballast || 0
                                                                                    }
                                                                                });
                                                                            }}
                                                                            disabled={isInherited}
                                                                        />
                                                                    </td>
                                                                    <td className="py-3">
                                                                        {((isInherited ? sourceShip?.tankCounts?.cargo : editingShip.tankCounts?.cargo) || 0) > 0 && (
                                                                            <div className="flex items-center gap-2">
                                                                                <input
                                                                                    type="number"
                                                                                    className="w-20 bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-white disabled:text-slate-500"
                                                                                    value={(isInherited ? sourceShip?.tankCounts?.cargo : editingShip.tankCounts?.cargo)?.toString()}
                                                                                    onChange={(ev) => setEditingShip({
                                                                                        ...editingShip,
                                                                                        tankCounts: {
                                                                                            ...editingShip.tankCounts,
                                                                                            cargo: Number(ev.target.value),
                                                                                            ballast: editingShip.tankCounts?.ballast || 0
                                                                                        }
                                                                                    })}
                                                                                    min={1}
                                                                                    disabled={isInherited}
                                                                                />
                                                                                <span className="text-slate-500 text-sm">EA</span>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                </tr>

                                                                {/* Ballast Tank Row */}
                                                                <tr>
                                                                    <td className="py-3 text-white">
                                                                        <div className="flex items-center gap-2">
                                                                            <Database size={18} className="text-emerald-400" />
                                                                            <span className="font-bold">Ballast Tank</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-3">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="w-5 h-5 rounded border-slate-600 bg-ocean-900 text-emerald-500 cursor-pointer"
                                                                            checked={((isInherited ? sourceShip?.tankCounts?.ballast : editingShip.tankCounts?.ballast) || 0) > 0}
                                                                            onChange={(e) => {
                                                                                setEditingShip({
                                                                                    ...editingShip,
                                                                                    tankCounts: {
                                                                                        ...editingShip.tankCounts,
                                                                                        ballast: e.target.checked ? 1 : 0,
                                                                                        cargo: editingShip.tankCounts?.cargo || 0
                                                                                    }
                                                                                });
                                                                            }}
                                                                            disabled={isInherited}
                                                                        />
                                                                    </td>
                                                                    <td className="py-3">
                                                                        {((isInherited ? sourceShip?.tankCounts?.ballast : editingShip.tankCounts?.ballast) || 0) > 0 && (
                                                                            <div className="flex items-center gap-2">
                                                                                <input
                                                                                    type="number"
                                                                                    className="w-20 bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-white disabled:text-slate-500"
                                                                                    value={(isInherited ? sourceShip?.tankCounts?.ballast : editingShip.tankCounts?.ballast)?.toString()}
                                                                                    onChange={(ev) => setEditingShip({
                                                                                        ...editingShip,
                                                                                        tankCounts: {
                                                                                            ...editingShip.tankCounts,
                                                                                            ballast: Number(ev.target.value),
                                                                                            cargo: editingShip.tankCounts?.cargo || 0
                                                                                        }
                                                                                    })}
                                                                                    min={1}
                                                                                    disabled={isInherited}
                                                                                />
                                                                                <span className="text-slate-500 text-sm">EA</span>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>

                                <div className="p-6 border-t border-ocean-700 flex justify-end gap-3 shrink-0 bg-ocean-800 z-10">
                                    <button onClick={() => setIsShipEditMode(false)} className="px-6 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600">Cancel</button>
                                    <button onClick={handleSaveShip} className="px-6 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-400 font-bold">Save Configuration</button>
                                </div>
                            </div>
                        </div >
                    )}
                </div>
            )
            }



            {/* Event Management Tab */}
            {
                activeTab === 'events' && (
                    <div className="bg-ocean-800 rounded-2xl border border-ocean-700 overflow-hidden">
                        <div className="flex justify-between items-center border-b border-ocean-700 bg-ocean-900/50 p-4">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                Event Configurations
                            </h3>
                            <button onClick={() => openEdit(null, 'ev')} className="text-emerald-400 hover:text-emerald-300 text-sm font-medium flex items-center gap-1">
                                <Plus size={16} /> Add New Event
                            </button>
                        </div>
                        <div className="bg-ocean-900/30 p-4 border-b border-ocean-700">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search events..."
                                    value={filterQuery}
                                    onChange={(e) => setFilterQuery(e.target.value)}
                                    className="w-full bg-ocean-900 border border-ocean-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:ring-2 focus:ring-primary-500 outline-none"
                                />
                            </div>
                        </div>

                        {isEditMode && editingCode && (
                            <div className="p-6 bg-ocean-900/50 border-b border-ocean-700 animate-in fade-in slide-in-from-top-2">
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl font-bold text-white">
                                            {editingCode.code ? `Edit Event: ${editingCode.name}` : 'New Event'}
                                        </h3>
                                        <div className="flex gap-2">
                                            <button onClick={handleSaveCode} className="bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-2 rounded-lg font-medium">Save Configuration</button>
                                            <button onClick={() => setIsEditMode(false)} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium">Cancel</button>
                                        </div>
                                    </div>

                                    {/* Basic Info */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <Input placeholder="Code (e.g., EV01)" value={editingCode.code} onChange={v => setEditingCode({ ...editingCode, code: v })} />
                                        <Input placeholder="Event Name" value={editingCode.name} onChange={v => setEditingCode({ ...editingCode, name: v })} />
                                        <Input placeholder="Priority" type="number" value={editingCode.priority} onChange={v => setEditingCode({ ...editingCode, priority: Number(v) })} />
                                        <Input placeholder="Related M-Code (e.g., M01)" value={editingCode.mCode} onChange={v => setEditingCode({ ...editingCode, mCode: v })} />
                                        <div className="md:col-span-4">
                                            <Input placeholder="Description" value={editingCode.description} onChange={v => setEditingCode({ ...editingCode, description: v })} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
                                        {/* Task Selection */}
                                        <div className="bg-ocean-800 rounded-xl p-4 border border-ocean-700 h-[500px] overflow-y-auto">
                                            <h4 className="text-lg font-bold text-primary-400 mb-4 sticky top-0 bg-ocean-800 pb-2 border-b border-ocean-700 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-primary-400"></div>
                                                Required Tasks (T-Codes)
                                            </h4>
                                            <div className="space-y-2">
                                                {codes?.tCodes
                                                    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
                                                    .map(t => (
                                                        <label key={t.code} className="flex items-start gap-3 p-3 rounded-lg hover:bg-ocean-700/50 cursor-pointer group transition-colors">
                                                            <input
                                                                type="checkbox"
                                                                className="mt-1 w-4 h-4 rounded border-slate-600 bg-ocean-900 text-primary-500 focus:ring-primary-500"
                                                                checked={editingCode.validTCodes?.includes(t.code)}
                                                                onChange={(e) => {
                                                                    const current = editingCode.validTCodes || [];
                                                                    const updated = e.target.checked
                                                                        ? [...current, t.code]
                                                                        : current.filter((c: string) => c !== t.code);
                                                                    setEditingCode({ ...editingCode, validTCodes: updated });
                                                                }}
                                                            />
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono text-xs text-primary-400/80 bg-primary-500/10 px-1.5 py-0.5 rounded">{t.code}</span>
                                                                    <span className="font-medium text-slate-200 group-hover:text-white">{t.name}</span>
                                                                    {t.priority && <span className="text-[10px] bg-slate-700 text-slate-300 px-1 rounded">P{t.priority}</span>}
                                                                </div>
                                                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{t.description}</p>
                                                            </div>
                                                        </label>
                                                    ))}
                                            </div>
                                        </div>

                                        {/* Item Selection */}
                                        <div className="bg-ocean-800 rounded-xl p-4 border border-ocean-700 h-[500px] overflow-y-auto">
                                            <h4 className="text-lg font-bold text-emerald-400 mb-4 sticky top-0 bg-ocean-800 pb-2 border-b border-ocean-700 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                                                Required Items (R-Codes)
                                            </h4>
                                            <div className="space-y-6">
                                                {Object.entries(
                                                    (codes?.rCodes || []).reduce((acc, code) => {
                                                        const group = code.group || 'Other';
                                                        if (!acc[group]) acc[group] = [];
                                                        acc[group].push(code);
                                                        return acc;
                                                    }, {} as Record<string, typeof codes.rCodes>)
                                                ).sort((a, b) => a[0].localeCompare(b[0]))
                                                    .map(([group, items]) => (
                                                        <div key={group}>
                                                            <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">{group}</h5>
                                                            <div className="space-y-1">
                                                                {items
                                                                    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
                                                                    .map(r => (
                                                                        <label key={r.code} className="flex items-start gap-3 p-2 rounded-lg hover:bg-ocean-700/50 cursor-pointer group transition-colors">
                                                                            <input
                                                                                type="checkbox"
                                                                                className="mt-1 w-4 h-4 rounded border-slate-600 bg-ocean-900 text-emerald-500 focus:ring-emerald-500"
                                                                                checked={editingCode.validRCodes?.includes(r.code)}
                                                                                onChange={(e) => {
                                                                                    const current = editingCode.validRCodes || [];
                                                                                    const updated = e.target.checked
                                                                                        ? [...current, r.code]
                                                                                        : current.filter((c: string) => c !== r.code);
                                                                                    setEditingCode({ ...editingCode, validRCodes: updated });
                                                                                }}
                                                                            />
                                                                            <div className="flex-1">
                                                                                <div className="flex items-center justify-between">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="font-mono text-xs text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded">{r.code}</span>
                                                                                        <span className="font-medium text-slate-200 group-hover:text-white">{r.name}</span>
                                                                                    </div>
                                                                                    {r.priority && <span className="text-[10px] bg-slate-700 text-slate-300 px-1 rounded">P{r.priority}</span>}
                                                                                </div>
                                                                                <div className="flex items-center justify-between mt-0.5">
                                                                                    <p className="text-xs text-slate-500 line-clamp-1">{r.description}</p>
                                                                                    <span className="text-[10px] text-slate-600 font-mono">{r.type}</span>
                                                                                </div>
                                                                            </div>
                                                                        </label>
                                                                    ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <CodeTable
                            data={filterData(codes.evCodes)}
                            columns={[
                                { k: 'priority', l: 'Priority' },
                                { k: 'code', l: 'Code' },
                                { k: 'name', l: 'Event Name' },
                                { k: 'mCode', l: 'Area' },
                                { k: 'description', l: 'Description' }
                            ]}
                            onDelete={handleDeleteCode}
                            onEdit={(item) => openEdit(item, 'ev')}
                        />
                    </div>
                )
            }

            {
                activeTab === 'codes' && (
                    <div className="bg-ocean-800 rounded-2xl border border-ocean-700 overflow-hidden">
                        <div className="flex justify-between items-center border-b border-ocean-700 bg-ocean-900/50 pr-4">
                            <div className="flex">
                                <CodeTab active={activeCodeTab === 'm'} onClick={() => setActiveCodeTab('m')} label="M-Codes" />
                                <CodeTab active={activeCodeTab === 't'} onClick={() => setActiveCodeTab('t')} label="T-Codes" />
                                <CodeTab active={activeCodeTab === 'r'} onClick={() => setActiveCodeTab('r')} label="R-Codes" />
                            </div>
                            {(activeCodeTab === 't' || activeCodeTab === 'r') && (
                                <button onClick={() => openEdit(null, 'code')} className="text-emerald-400 hover:text-emerald-300 text-sm font-medium flex items-center gap-1">
                                    <Plus size={16} /> Add New
                                </button>
                            )}
                        </div>
                        <div className="bg-ocean-900/30 p-4 border-b border-ocean-700 flex gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search codes..."
                                    value={filterQuery}
                                    onChange={(e) => setFilterQuery(e.target.value)}
                                    className="w-full bg-ocean-900 border border-ocean-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:ring-2 focus:ring-primary-500 outline-none"
                                />
                            </div>
                            {activeCodeTab === 'r' && (
                                <div className="relative w-64">
                                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                    <select
                                        value={selectedGroup || ''}
                                        onChange={(e) => setSelectedGroup(e.target.value || null)}
                                        className="w-full bg-ocean-900 border border-ocean-600 rounded-lg pl-10 pr-4 py-2 text-white outline-none focus:ring-2 focus:ring-primary-500 appearance-none"
                                    >
                                        <option value="">All Groups</option>
                                        {Array.from(new Set(codes.rCodes.map(r => r.group).filter(Boolean))).sort().map(g => (
                                            <option key={g} value={g}>{g}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                                </div>
                            )}
                        </div>

                        {isEditMode && editingCode && (
                            <div className="p-4 bg-ocean-900/50 border-b border-ocean-700 grid grid-cols-4 gap-4 items-end animate-in fade-in slide-in-from-top-2">
                                <Input placeholder="Code (e.g., T01)" value={editingCode.code} onChange={v => setEditingCode({ ...editingCode, code: v })} />
                                <Input placeholder="Name" value={editingCode.name} onChange={v => setEditingCode({ ...editingCode, name: v })} />
                                <Input placeholder="Priority" type="number" value={editingCode.priority} onChange={v => setEditingCode({ ...editingCode, priority: Number(v) })} />
                                {(activeCodeTab === 't') && <Input placeholder="Description" value={editingCode.description} onChange={v => setEditingCode({ ...editingCode, description: v })} />}
                                {(activeCodeTab === 'r' || activeCodeTab === 't') && <Input placeholder="Unit" value={editingCode.unit} onChange={v => setEditingCode({ ...editingCode, unit: v })} />}
                                {activeCodeTab === 'r' && <Input placeholder="Group" value={editingCode.group} onChange={v => setEditingCode({ ...editingCode, group: v })} />}

                                <div className="flex gap-2">
                                    <button onClick={handleSaveCode} className="bg-emerald-500 text-white px-3 py-2 rounded-lg text-sm">Save</button>
                                    <button onClick={() => setIsEditMode(false)} className="bg-slate-700 text-white px-3 py-2 rounded-lg text-sm">Cancel</button>
                                </div>
                            </div>
                        )}

                        <div className="p-0">
                            {activeCodeTab === 'm' && <CodeTable data={filterData(codes.mCodes)} columns={[{ k: 'code', l: 'Code' }, { k: 'name', l: 'Area Name' }]} sortConfig={sortConfig} onSort={handleSort} />}

                            {activeCodeTab === 't' && (
                                <CodeTable
                                    data={filterData(codes.tCodes)}
                                    columns={[
                                        { k: 'priority', l: 'Priority' },
                                        { k: 'code', l: 'Code' },
                                        { k: 'name', l: 'Task Name' },
                                        { k: 'description', l: 'Description' },
                                        { k: 'unit', l: 'Unit' }
                                    ]}
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    onDelete={handleDeleteCode}
                                    onEdit={(item) => openEdit(item, 'code')}
                                />
                            )}

                            {activeCodeTab === 'r' && (
                                <CodeTable
                                    data={filterData(codes.rCodes)}
                                    columns={[
                                        { k: 'priority', l: 'Priority' },
                                        { k: 'code', l: 'Code' },
                                        { k: 'name', l: 'Item Name' },
                                        { k: 'unit', l: 'Unit' },
                                        { k: 'group', l: 'Group' }
                                    ]}
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    onDelete={handleDeleteCode}
                                    onEdit={(item) => openEdit(item, 'code')}
                                />
                            )}
                        </div>
                    </div>
                )
            }

            {/* Port Management Tab */}
            {activeTab === 'ports' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-white">Registered Ports</h2>
                        <div className="flex gap-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search ports..."
                                    className="bg-ocean-900 border border-ocean-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary-500 outline-none w-64"
                                    value={filterQuery}
                                    onChange={(e) => setFilterQuery(e.target.value)}
                                />
                            </div>
                            <button onClick={() => openPortEdit()} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2">
                                <Plus size={18} /> Add New Port
                            </button>
                        </div>
                    </div>

                    {/* Virtualized Port List */}
                    <div className="bg-ocean-800 rounded-2xl border border-ocean-700 overflow-hidden flex flex-col h-[600px]">
                        <div className="bg-ocean-900/50 text-slate-400 text-xs uppercase tracking-wider flex border-b border-ocean-700 shrink-0">
                            <div className="w-32 px-6 py-4 font-semibold">Port Code</div>
                            <div className="flex-1 px-6 py-4 font-semibold">Port Name</div>
                            <div className="w-32 px-6 py-4 font-semibold">Country</div>
                            <div className="w-[150px] px-6 py-4 text-right font-semibold">Actions</div>
                        </div>

                        <div className="flex-1">
                            {visiblePorts.length > 0 ? (
                                <div className="overflow-y-auto h-[550px]">
                                    {visiblePorts.slice(0, 50).map((port, index) => (
                                        <div key={port.code || index} className="flex items-center hover:bg-ocean-700/30 transition-colors border-b border-ocean-700/50">
                                            <div className="w-32 px-6 py-4 text-sm text-primary-400 font-mono truncate">{port.code}</div>
                                            <div className="flex-1 px-6 py-4 text-sm text-slate-300 truncate" title={port.name}>{port.name}</div>
                                            <div className="w-32 px-6 py-4 text-sm text-slate-400 truncate">{port.country}</div>
                                            <div className="w-[150px] px-6 py-4 text-right flex justify-end gap-2 shrink-0">
                                                <button onClick={() => openPortEdit(port)} className="text-blue-400 hover:text-blue-300 text-sm">Edit</button>
                                                <button onClick={() => handleDeletePort(port.code)} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-slate-500">
                                    No ports found matching your search.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Port Edit Modal */}
                    {isPortEditMode && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                            <div className="bg-ocean-800 rounded-2xl border border-ocean-700 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                                <div className="p-6 border-b border-ocean-700 flex justify-between items-center">
                                    <h2 className="text-xl font-bold text-white">{editingPort.code ? 'Edit Port' : 'Add New Port'}</h2>
                                    <button onClick={() => setIsPortEditMode(false)} className="text-slate-400 hover:text-white">✕</button>
                                </div>
                                <div className="p-6 space-y-4">
                                    <LabeledInput
                                        label="Port Code (UN/LOCODE)"
                                        value={editingPort.code}
                                        onChange={v => setEditingPort({ ...editingPort, code: v.toUpperCase() })}
                                        placeholder="e.g. KRPUS"
                                    />
                                    <LabeledInput
                                        label="Port Name"
                                        value={editingPort.name}
                                        onChange={v => setEditingPort({ ...editingPort, name: v })}
                                        placeholder="e.g. Busan"
                                    />
                                    <LabeledInput
                                        label="Country Code"
                                        value={editingPort.country}
                                        onChange={v => setEditingPort({ ...editingPort, country: v.toUpperCase() })}
                                        placeholder="e.g. KR"
                                    />
                                </div>
                                <div className="p-6 border-t border-ocean-700 flex justify-end gap-3">
                                    <button onClick={() => setIsPortEditMode(false)} className="px-4 py-2 text-slate-300 hover:text-white transition-colors">Cancel</button>
                                    <button onClick={handleSavePort} className="px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-bold">Save</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
            {/* M/E Performance Tab */}
            {activeTab === 'mePerformance' && (
                <div className="bg-ocean-800 rounded-2xl p-8 border border-ocean-700 max-w-4xl">
                    <div className="flex items-center gap-4 mb-6 text-emerald-400">
                        <Activity size={32} />
                        <h2 className="text-2xl font-bold text-white">M/E Performance Curves</h2>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Select Vessel</label>
                            <select
                                className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-primary-500"
                                onChange={handleShipSelect}
                                value={selectedShip?.code || ''}
                            >
                                <option value="">-- Select a Ship --</option>
                                {ships.map(ship => (
                                    <option key={ship.code} value={ship.code}>
                                        {ship.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedShip && (
                            <div className="animate-in fade-in slide-in-from-top-2">
                                <div className="bg-ocean-900/30 rounded-xl border border-ocean-700/50 overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-ocean-900/50 text-slate-400 text-xs uppercase tracking-wider">
                                            <tr>
                                                <th className="px-6 py-4">Load (%)</th>
                                                <th className="px-6 py-4">Power (kW)</th>
                                                <th className="px-6 py-4">RPM</th>
                                                <th className="px-6 py-4">SFOC (g/kWh)</th>
                                                <th className="px-6 py-4">GFOC (g/kWh)</th>
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-ocean-700">
                                            {(selectedShip.mePerformance || []).map((row, idx) => (
                                                <tr key={idx} className="hover:bg-ocean-700/30 transition-colors">
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            className="w-full bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-white text-sm outline-none focus:border-emerald-500"
                                                            value={row.load}
                                                            onChange={(e) => {
                                                                const newVal = parseFloat(e.target.value) || 0;
                                                                const updated = [...(selectedShip.mePerformance || [])];
                                                                updated[idx] = { ...updated[idx], load: newVal };
                                                                const updatedShip = { ...selectedShip, mePerformance: updated };
                                                                setSelectedShip(updatedShip);
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            className="w-full bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-white text-sm outline-none focus:border-emerald-500"
                                                            value={row.power}
                                                            onChange={(e) => {
                                                                const newVal = parseFloat(e.target.value) || 0;
                                                                const updated = [...(selectedShip.mePerformance || [])];
                                                                updated[idx] = { ...updated[idx], power: newVal };
                                                                const updatedShip = { ...selectedShip, mePerformance: updated };
                                                                setSelectedShip(updatedShip);
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            className="w-full bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-white text-sm outline-none focus:border-emerald-500"
                                                            value={row.rpm}
                                                            onChange={(e) => {
                                                                const newVal = parseFloat(e.target.value) || 0;
                                                                const updated = [...(selectedShip.mePerformance || [])];
                                                                updated[idx] = { ...updated[idx], rpm: newVal };
                                                                const updatedShip = { ...selectedShip, mePerformance: updated };
                                                                setSelectedShip(updatedShip);
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            className="w-full bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-white text-sm outline-none focus:border-emerald-500"
                                                            value={row.sfoc}
                                                            onChange={(e) => {
                                                                const newVal = parseFloat(e.target.value) || 0;
                                                                const updated = [...(selectedShip.mePerformance || [])];
                                                                updated[idx] = { ...updated[idx], sfoc: newVal };
                                                                const updatedShip = { ...selectedShip, mePerformance: updated };
                                                                setSelectedShip(updatedShip);
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            className="w-full bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-white text-sm outline-none focus:border-emerald-500"
                                                            value={row.gfoc}
                                                            onChange={(e) => {
                                                                const newVal = parseFloat(e.target.value) || 0;
                                                                const updated = [...(selectedShip.mePerformance || [])];
                                                                updated[idx] = { ...updated[idx], gfoc: newVal };
                                                                const updatedShip = { ...selectedShip, mePerformance: updated };
                                                                setSelectedShip(updatedShip);
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3 text-right">
                                                        <button
                                                            onClick={() => {
                                                                const updated = (selectedShip.mePerformance || []).filter((_, i) => i !== idx);
                                                                const updatedShip = { ...selectedShip, mePerformance: updated };
                                                                setSelectedShip(updatedShip);
                                                            }}
                                                            className="text-red-400 hover:text-red-300 p-1"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!selectedShip.mePerformance || selectedShip.mePerformance.length === 0) && (
                                                <tr>
                                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500 italic">
                                                        No performance data defined. Add a row to start.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                    <div className="p-4 border-t border-ocean-700 bg-ocean-900/50 flex justify-between">
                                        <button
                                            onClick={() => {
                                                const updated = [...(selectedShip.mePerformance || []), { load: 0, power: 0, rpm: 0, sfoc: 0, gfoc: 0 }];
                                                const updatedShip = { ...selectedShip, mePerformance: updated };
                                                setSelectedShip(updatedShip);
                                            }}
                                            className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-medium px-3 py-1.5 rounded hover:bg-emerald-500/10 transition-colors"
                                        >
                                            <Plus size={16} /> Add Row
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!selectedShip) return;
                                                const updatedShips = ships.map(s => s.code === selectedShip.code ? selectedShip : s);
                                                try {
                                                    await saveShips(updatedShips);
                                                    setShips(updatedShips);
                                                    alert("M/E Performance data saved successfully!");
                                                } catch (err) {
                                                    console.error("Failed to save ship", err);
                                                    alert("Failed to save configuration");
                                                }
                                            }}
                                            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-lg shadow-emerald-500/20"
                                        >
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-4 p-4 bg-ocean-900/30 rounded-xl border border-ocean-700/50 text-sm text-slate-400">
                                    <p className="font-semibold text-emerald-400 mb-2">Instructions</p>
                                    <ul className="list-disc pl-5 space-y-1">
                                        <li>Enter performance data points from the shop test or sea trial report.</li>
                                        <li>Typically includes points at 25%, 50%, 75%, 85%, and 100% Load.</li>
                                        <li>Used for performance analysis and calculations.</li>
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Generator Performance Tab */}
            {activeTab === 'gePerformance' && (
                <div className="bg-ocean-800 rounded-2xl p-8 border border-ocean-700 max-w-4xl">
                    <div className="flex items-center gap-4 mb-6 text-emerald-400">
                        <Zap size={32} />
                        <h2 className="text-2xl font-bold text-white">Generator Performance Curves</h2>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Select Vessel</label>
                            <select
                                className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-primary-500"
                                onChange={handleShipSelect}
                                value={selectedShip?.code || ''}
                            >
                                <option value="">-- Select a Ship --</option>
                                {ships.map(ship => (
                                    <option key={ship.code} value={ship.code}>
                                        {ship.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedShip && (
                            <div className="animate-in fade-in slide-in-from-top-2">
                                <div className="bg-ocean-900/30 rounded-xl border border-ocean-700/50 overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-ocean-900/50 text-slate-400 text-xs uppercase tracking-wider">
                                            <tr>
                                                <th className="px-6 py-4">Load (%)</th>
                                                <th className="px-6 py-4">Power (kW)</th>
                                                <th className="px-6 py-4">SFOC (g/kWh)</th>
                                                <th className="px-6 py-4">GFOC (g/kWh)</th>
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-ocean-700">
                                            {(selectedShip.gePerformance || []).map((row, idx) => (
                                                <tr key={idx} className="hover:bg-ocean-700/30 transition-colors">
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            className="w-full bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-white text-sm outline-none focus:border-emerald-500"
                                                            value={row.load}
                                                            onChange={(e) => {
                                                                const newVal = parseFloat(e.target.value) || 0;
                                                                const updated = [...(selectedShip.gePerformance || [])];
                                                                updated[idx] = { ...updated[idx], load: newVal };
                                                                const updatedShip = { ...selectedShip, gePerformance: updated };
                                                                setSelectedShip(updatedShip);
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            className="w-full bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-white text-sm outline-none focus:border-emerald-500"
                                                            value={row.power}
                                                            onChange={(e) => {
                                                                const newVal = parseFloat(e.target.value) || 0;
                                                                const updated = [...(selectedShip.gePerformance || [])];
                                                                updated[idx] = { ...updated[idx], power: newVal };
                                                                const updatedShip = { ...selectedShip, gePerformance: updated };
                                                                setSelectedShip(updatedShip);
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            className="w-full bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-white text-sm outline-none focus:border-emerald-500"
                                                            value={row.sfoc}
                                                            onChange={(e) => {
                                                                const newVal = parseFloat(e.target.value) || 0;
                                                                const updated = [...(selectedShip.gePerformance || [])];
                                                                updated[idx] = { ...updated[idx], sfoc: newVal };
                                                                const updatedShip = { ...selectedShip, gePerformance: updated };
                                                                setSelectedShip(updatedShip);
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="number"
                                                            className="w-full bg-ocean-900 border border-ocean-600 rounded px-2 py-1 text-white text-sm outline-none focus:border-emerald-500"
                                                            value={row.gfoc}
                                                            onChange={(e) => {
                                                                const newVal = parseFloat(e.target.value) || 0;
                                                                const updated = [...(selectedShip.gePerformance || [])];
                                                                updated[idx] = { ...updated[idx], gfoc: newVal };
                                                                const updatedShip = { ...selectedShip, gePerformance: updated };
                                                                setSelectedShip(updatedShip);
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-3 text-right">
                                                        <button
                                                            onClick={() => {
                                                                const updated = (selectedShip.gePerformance || []).filter((_, i) => i !== idx);
                                                                const updatedShip = { ...selectedShip, gePerformance: updated };
                                                                setSelectedShip(updatedShip);
                                                            }}
                                                            className="text-red-400 hover:text-red-300 p-1"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!selectedShip.gePerformance || selectedShip.gePerformance.length === 0) && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">
                                                        No performance data defined. Add a row to start.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                    <div className="p-4 border-t border-ocean-700 bg-ocean-900/50 flex justify-between">
                                        <button
                                            onClick={() => {
                                                const updated = [...(selectedShip.gePerformance || []), { load: 0, power: 0, sfoc: 0, gfoc: 0 }];
                                                const updatedShip = { ...selectedShip, gePerformance: updated };
                                                setSelectedShip(updatedShip);
                                            }}
                                            className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-medium px-3 py-1.5 rounded hover:bg-emerald-500/10 transition-colors"
                                        >
                                            <Plus size={16} /> Add Row
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!selectedShip) return;
                                                const updatedShips = ships.map(s => s.code === selectedShip.code ? selectedShip : s);
                                                try {
                                                    await saveShips(updatedShips);
                                                    setShips(updatedShips);
                                                    alert("Generator Performance data saved successfully!");
                                                } catch (err) {
                                                    console.error("Failed to save ship", err);
                                                    alert("Failed to save configuration");
                                                }
                                            }}
                                            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-lg shadow-emerald-500/20"
                                        >
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* FOC Management Tab */}
            {activeTab === 'focManagement' && (
                <div className="bg-ocean-800 rounded-2xl p-8 border border-ocean-700 max-w-full overflow-x-auto">
                    <div className="flex items-center gap-4 mb-6 text-emerald-400">
                        <Droplet size={32} />
                        <h2 className="text-2xl font-bold text-white">FOC Matrix Management</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="flex gap-8 items-end">
                            <div className="w-64">
                                <label className="block text-sm font-medium text-slate-400 mb-1">Select Vessel</label>
                                <select
                                    className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-primary-500"
                                    onChange={handleShipSelect}
                                    value={selectedShip?.code || ''}
                                >
                                    <option value="">-- Select a Ship --</option>
                                    {ships.map(ship => (
                                        <option key={ship.code} value={ship.code}>
                                            {ship.name}
                                        </option>
                                    ))}
                                </select>
                            </div>


                        </div>

                        {selectedShip && (() => {
                            // Helper logic for Matrix View
                            const FocMatrix = () => {
                                const [mode, setMode] = useState<'laden' | 'ballast'>('laden');
                                const profiles = (selectedShip.focManagement || []).filter(p => p.mode === mode);

                                // Deriving unique speeds to build rows. 
                                // We assume all columns should be synced, but if they differ, we union them.
                                // For a "Matrix" feel, it's best to enforce same speeds.
                                // Let's collect all unique speeds from all profiles and sort them descending (high speed to low).
                                const allSpeeds = Array.from(new Set(
                                    profiles.flatMap(p => p.data.map(d => d.speed))
                                )).sort((a, b) => b - a);

                                const updateProfileData = (profileId: string, speed: number, field: 'foc', value: number) => {
                                    const updatedProfiles = [...(selectedShip.focManagement || [])];
                                    const pIndex = updatedProfiles.findIndex(p => p.id === profileId);
                                    if (pIndex === -1) return;

                                    const existingDataIdx = updatedProfiles[pIndex].data.findIndex(d => d.speed === speed);
                                    if (existingDataIdx >= 0) {
                                        updatedProfiles[pIndex].data[existingDataIdx][field] = value;
                                    } else {
                                        // Add new data point if specific speed missing in this profile
                                        updatedProfiles[pIndex].data.push({ speed, foc: value, rpm: 0 });
                                        updatedProfiles[pIndex].data.sort((a, b) => b.speed - a.speed);
                                    }
                                    setSelectedShip({ ...selectedShip, focManagement: updatedProfiles });
                                };

                                const addColumn = () => {
                                    const name = prompt("Enter Type Name (e.g. A-GL-Type):");
                                    if (!name) return;

                                    // Initialize with current rows (speeds) with 0 values
                                    const initialData = allSpeeds.map(s => ({ speed: s, foc: 0, rpm: 0 }));

                                    const newProfile = {
                                        id: Date.now().toString(),
                                        mode,
                                        type: name,
                                        data: initialData
                                    };
                                    const updatedProfiles = [...(selectedShip.focManagement || []), newProfile];
                                    setSelectedShip({ ...selectedShip, focManagement: updatedProfiles });
                                };

                                const deleteColumn = (id: string) => {
                                    if (!confirm("Delete this column?")) return;
                                    const updatedProfiles = (selectedShip.focManagement || []).filter(p => p.id !== id);
                                    setSelectedShip({ ...selectedShip, focManagement: updatedProfiles });
                                };

                                const addRow = () => {
                                    const newSpeed = parseFloat(prompt("Enter Speed (kts):") || "0");
                                    if (!newSpeed) return;
                                    if (allSpeeds.includes(newSpeed)) {
                                        alert("Speed already exists!");
                                        return;
                                    }

                                    // Add this speed to ALL profiles in current mode
                                    const updatedProfiles = [...(selectedShip.focManagement || [])];
                                    updatedProfiles.forEach(p => {
                                        if (p.mode === mode) {
                                            p.data.push({ speed: newSpeed, foc: 0, rpm: 0 });
                                            p.data.sort((a, b) => b.speed - a.speed);
                                        }
                                    });
                                    setSelectedShip({ ...selectedShip, focManagement: updatedProfiles });
                                };

                                const deleteRow = (speed: number) => {
                                    if (!confirm(`Delete row for ${speed} kts?`)) return;
                                    const updatedProfiles = [...(selectedShip.focManagement || [])];
                                    updatedProfiles.forEach(p => {
                                        if (p.mode === mode) {
                                            p.data = p.data.filter(d => d.speed !== speed);
                                        }
                                    });
                                    setSelectedShip({ ...selectedShip, focManagement: updatedProfiles });
                                };

                                return (
                                    <div className="animate-in fade-in slide-in-from-top-2">
                                        <div className="flex gap-2 mb-4">
                                            {(['laden', 'ballast'] as const).map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => setMode(m)}
                                                    className={cn(
                                                        "px-6 py-2 rounded-lg font-bold uppercase transition-all border",
                                                        mode === m
                                                            ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20"
                                                            : "bg-ocean-900 text-slate-400 border-ocean-600 hover:border-emerald-500/50 hover:text-emerald-400"
                                                    )}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="bg-ocean-900/30 rounded-xl border border-ocean-700/50 overflow-x-auto">
                                            <table className="w-full text-center border-collapse">
                                                <thead>
                                                    <tr className="bg-ocean-900 text-slate-300 text-xs uppercase tracking-wider">
                                                        <th className="px-4 py-3 border-r border-b border-ocean-700 font-bold text-emerald-400 sticky left-0 bg-ocean-900 z-10">
                                                            Speed (kts)
                                                        </th>
                                                        {profiles.map(p => (
                                                            <th key={p.id} className="px-2 py-3 border-r border-b border-ocean-700 min-w-[100px] group relative">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    {p.type}
                                                                    <button onClick={() => deleteColumn(p.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </th>
                                                        ))}
                                                        <th className="px-4 py-3 border-b border-ocean-700 bg-ocean-800/50">
                                                            <button onClick={addColumn} className="flex items-center gap-1 text-emerald-400 hover:text-white transition-colors mx-auto">
                                                                <Plus size={16} /> Type
                                                            </button>
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-ocean-700/50">
                                                    {allSpeeds.map(speed => (
                                                        <tr key={speed} className="hover:bg-ocean-800/30 transition-colors group">
                                                            <td className="px-4 py-2 border-r border-ocean-700 font-bold text-white bg-ocean-900/10 sticky left-0 group-hover:bg-ocean-800/30">
                                                                <div className="flex items-center justify-between">
                                                                    {speed}
                                                                    <button onClick={() => deleteRow(speed)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            {profiles.map(p => {
                                                                const cell = p.data.find(d => d.speed === speed);
                                                                return (
                                                                    <td key={p.id} className="px-2 py-1 border-r border-ocean-700/50 p-0">
                                                                        <input
                                                                            type="number"
                                                                            className="w-full h-full bg-transparent text-center text-white text-sm outline-none focus:bg-emerald-500/10 py-2"
                                                                            value={cell?.foc ?? ''}
                                                                            placeholder="-"
                                                                            onChange={(e) => updateProfileData(p.id, speed, 'foc', parseFloat(e.target.value))}
                                                                        />
                                                                    </td>
                                                                );
                                                            })}
                                                            <td className="px-4 py-2 bg-ocean-900/10"></td>
                                                        </tr>
                                                    ))}
                                                    <tr>
                                                        <td className="px-4 py-3 font-bold text-center border-r border-ocean-700 sticky left-0 bg-ocean-900">
                                                            <button onClick={addRow} className="flex items-center gap-1 text-emerald-400 hover:text-white transition-colors mx-auto text-xs">
                                                                <Plus size={14} /> Row
                                                            </button>
                                                        </td>
                                                        <td colSpan={profiles.length + 1}></td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="flex justify-end pt-6 border-t border-ocean-700 mt-6">
                                            <button
                                                onClick={async () => {
                                                    const updatedShips = ships.map(s => s.code === selectedShip.code ? selectedShip : s);
                                                    try {
                                                        await saveShips(updatedShips);
                                                        setShips(updatedShips);
                                                        alert("FOC Matrix saved successfully!");
                                                    } catch (err) {
                                                        console.error("Failed to save ship", err);
                                                        alert("Failed to save configuration");
                                                    }
                                                }}
                                                className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold transition-colors shadow-lg shadow-emerald-500/20"
                                            >
                                                Save All Changes
                                            </button>
                                        </div>
                                    </div>
                                );
                            };
                            return <FocMatrix />;
                        })()}
                    </div>
                </div>
            )}

            {/* M/E RPM-Speed Tab */}
            {activeTab === 'meRpmSpeed' && (
                <div className="bg-ocean-800 rounded-2xl p-8 border border-ocean-700 max-w-full overflow-x-auto">
                    <div className="flex items-center gap-4 mb-6 text-emerald-400">
                        <Gauge size={32} />
                        <h2 className="text-2xl font-bold text-white">M/E RPM-Speed Management</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="flex gap-8 items-end">
                            <div className="w-64">
                                <label className="block text-sm font-medium text-slate-400 mb-1">Select Vessel</label>
                                <select
                                    className="w-full bg-ocean-900 border border-ocean-600 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-primary-500"
                                    onChange={handleShipSelect}
                                    value={selectedShip?.code || ''}
                                >
                                    <option value="">-- Select a Ship --</option>
                                    {ships.map(ship => (
                                        <option key={ship.code} value={ship.code}>
                                            {ship.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {selectedShip && (() => {
                            // Helper logic for RPM Speed Matrix View
                            const RpmSpeedMatrix = () => {
                                const [mode, setMode] = useState<'laden' | 'ballast'>('laden');
                                const profiles = (selectedShip.focManagement || []).filter(p => p.mode === mode);

                                const allSpeeds = Array.from(new Set(
                                    profiles.flatMap(p => p.data.map(d => d.speed))
                                )).sort((a, b) => b - a);

                                const updateProfileData = (profileId: string, speed: number, value: number) => {
                                    const updatedProfiles = [...(selectedShip.focManagement || [])];
                                    const pIndex = updatedProfiles.findIndex(p => p.id === profileId);
                                    if (pIndex === -1) return;

                                    const existingDataIdx = updatedProfiles[pIndex].data.findIndex(d => d.speed === speed);
                                    if (existingDataIdx >= 0) {
                                        updatedProfiles[pIndex].data[existingDataIdx].rpm = value;
                                    } else {
                                        updatedProfiles[pIndex].data.push({ speed, foc: 0, rpm: value });
                                        updatedProfiles[pIndex].data.sort((a, b) => b.speed - a.speed);
                                    }
                                    setSelectedShip({ ...selectedShip, focManagement: updatedProfiles });
                                };

                                const addColumn = () => {
                                    const name = prompt("Enter Type Name (e.g. A-GL-Type):");
                                    if (!name) return;
                                    const initialData = allSpeeds.map(s => ({ speed: s, foc: 0, rpm: 0 }));
                                    const newProfile = {
                                        id: Date.now().toString(),
                                        mode,
                                        type: name,
                                        data: initialData
                                    };
                                    const updatedProfiles = [...(selectedShip.focManagement || []), newProfile];
                                    setSelectedShip({ ...selectedShip, focManagement: updatedProfiles });
                                };

                                const deleteColumn = (id: string) => {
                                    if (!confirm("Delete this column?")) return;
                                    const updatedProfiles = (selectedShip.focManagement || []).filter(p => p.id !== id);
                                    setSelectedShip({ ...selectedShip, focManagement: updatedProfiles });
                                };

                                const addRow = () => {
                                    const newSpeed = parseFloat(prompt("Enter Speed (kts):") || "0");
                                    if (!newSpeed) return;
                                    if (allSpeeds.includes(newSpeed)) {
                                        alert("Speed already exists!");
                                        return;
                                    }
                                    const updatedProfiles = [...(selectedShip.focManagement || [])];
                                    updatedProfiles.forEach(p => {
                                        if (p.mode === mode) {
                                            p.data.push({ speed: newSpeed, foc: 0, rpm: 0 });
                                            p.data.sort((a, b) => b.speed - a.speed);
                                        }
                                    });
                                    setSelectedShip({ ...selectedShip, focManagement: updatedProfiles });
                                };

                                const deleteRow = (speed: number) => {
                                    if (!confirm(`Delete row for ${speed} kts?`)) return;
                                    const updatedProfiles = [...(selectedShip.focManagement || [])];
                                    updatedProfiles.forEach(p => {
                                        if (p.mode === mode) {
                                            p.data = p.data.filter(d => d.speed !== speed);
                                        }
                                    });
                                    setSelectedShip({ ...selectedShip, focManagement: updatedProfiles });
                                };

                                return (
                                    <div className="animate-in fade-in slide-in-from-top-2">
                                        <div className="flex gap-2 mb-4">
                                            {(['laden', 'ballast'] as const).map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => setMode(m)}
                                                    className={cn(
                                                        "px-6 py-2 rounded-lg font-bold uppercase transition-all border",
                                                        mode === m
                                                            ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20"
                                                            : "bg-ocean-900 text-slate-400 border-ocean-600 hover:border-emerald-500/50 hover:text-emerald-400"
                                                    )}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="bg-ocean-900/30 rounded-xl border border-ocean-700/50 overflow-x-auto">
                                            <table className="w-full text-center border-collapse">
                                                <thead>
                                                    <tr className="bg-ocean-900 text-slate-300 text-xs uppercase tracking-wider">
                                                        <th className="px-4 py-3 border-r border-b border-ocean-700 font-bold text-emerald-400 sticky left-0 bg-ocean-900 z-10">
                                                            Speed (kts)
                                                        </th>
                                                        {profiles.map(p => (
                                                            <th key={p.id} className="px-2 py-3 border-r border-b border-ocean-700 min-w-[100px] group relative">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    {p.type}
                                                                    <button onClick={() => deleteColumn(p.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </th>
                                                        ))}
                                                        <th className="px-4 py-3 border-b border-ocean-700 bg-ocean-800/50">
                                                            <button onClick={addColumn} className="flex items-center gap-1 text-emerald-400 hover:text-white transition-colors mx-auto">
                                                                <Plus size={16} /> Type
                                                            </button>
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-ocean-700/50">
                                                    {allSpeeds.map(speed => (
                                                        <tr key={speed} className="hover:bg-ocean-800/30 transition-colors group">
                                                            <td className="px-4 py-2 border-r border-ocean-700 font-bold text-white bg-ocean-900/10 sticky left-0 group-hover:bg-ocean-800/30">
                                                                <div className="flex items-center justify-between">
                                                                    {speed}
                                                                    <button onClick={() => deleteRow(speed)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            {profiles.map(p => {
                                                                const cell = p.data.find(d => d.speed === speed);
                                                                return (
                                                                    <td key={p.id} className="px-2 py-1 border-r border-ocean-700/50 p-0">
                                                                        <input
                                                                            type="number"
                                                                            className="w-full h-full bg-transparent text-center text-white text-sm outline-none focus:bg-emerald-500/10 py-2"
                                                                            value={cell?.rpm ?? ''}
                                                                            placeholder="-"
                                                                            onChange={(e) => updateProfileData(p.id, speed, parseFloat(e.target.value))}
                                                                        />
                                                                    </td>
                                                                );
                                                            })}
                                                            <td className="px-4 py-2 bg-ocean-900/10"></td>
                                                        </tr>
                                                    ))}
                                                    <tr>
                                                        <td className="px-4 py-3 font-bold text-center border-r border-ocean-700 sticky left-0 bg-ocean-900">
                                                            <button onClick={addRow} className="flex items-center gap-1 text-emerald-400 hover:text-white transition-colors mx-auto text-xs">
                                                                <Plus size={14} /> Row
                                                            </button>
                                                        </td>
                                                        <td colSpan={profiles.length + 1}></td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="flex justify-end pt-6 border-t border-ocean-700 mt-6">
                                            <button
                                                onClick={async () => {
                                                    const updatedShips = ships.map(s => s.code === selectedShip.code ? selectedShip : s);
                                                    try {
                                                        await saveShips(updatedShips);
                                                        setShips(updatedShips);
                                                        alert("RPM-Speed Matrix saved successfully!");
                                                    } catch (err) {
                                                        console.error("Failed to save ship", err);
                                                        alert("Failed to save configuration");
                                                    }
                                                }}
                                                className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold transition-colors shadow-lg shadow-emerald-500/20"
                                            >
                                                Save All Changes
                                            </button>
                                        </div>
                                    </div>
                                );
                            };
                            return <RpmSpeedMatrix />;
                        })()}
                    </div>
                </div>
            )}
        </div >
    );
};

export default Settings;
