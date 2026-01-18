import React, { useEffect, useState } from 'react';
import { fetchCodes, saveTCodes, saveRCodes, saveEVCodes } from '../api/codes';
import { fetchShips, saveShips } from '../api/ships';
import type { CodeData, Ship } from '../types/index';
import { Database, Server, Ship as ShipIcon, Trash2, Plus, CheckCircle, Search, ChevronUp, ChevronDown, Filter, Box } from 'lucide-react';
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
    const [activeTab, setActiveTab] = useState<'general' | 'events' | 'codes' | 'ships'>('general');
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
                const [codeData, shipData, customFieldsData] = await Promise.all([
                    fetchCodes(),
                    fetchShips(),
                    fetch('http://localhost:8500/api/ship-custom-fields').then(res => res.json())
                ]);
                setCodes(codeData);
                setShips(shipData);
                setCustomFields(customFieldsData);
            } catch (err: any) {
                console.error("Failed to load configuration", err);
                setError(err.message || "Failed to load configuration data.");
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

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
                code: '', name: '', yard: '', hullNo: '', class: '', flag: '', cargo: '', dwt: 0,
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
        selected: { code: string; initialRob?: number }[] | undefined,
        toggle: (code: string) => void,
        updateRob: (code: string, val: string) => void,
        isInherited: boolean = false
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
            <div className="flex gap-4 border-b border-ocean-700">
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
                                                                    initialRob: editingShip.fuels?.find(t => t.code === src.code)?.initialRob ?? 0 // Default inherited to 0 if not set locally
                                                                }))
                                                                : editingShip.fuels,
                                                            toggleFuel,
                                                            updateFuelRob,
                                                            isInherited
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
        </div >
    );
};



export default Settings;
