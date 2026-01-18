import React, { forwardRef } from 'react';
import type { Report, Ship, CodeData, RCode } from '../types';
import { Ship as ShipIcon } from 'lucide-react';

interface PrintableReportProps {
    report: Report;
    ship: Ship;
    codes: CodeData;
}

const PrintableReport = forwardRef<HTMLDivElement, PrintableReportProps>(({ report, ship, codes }, ref) => {

    // Safety check
    if (!report || !codes) return <div ref={ref}>Loading...</div>;

    // Group RCodes
    const groups: Record<string, RCode[]> = {};
    codes.rCodes.forEach(r => {
        const g = r.group || 'ETC';
        if (!groups[g]) groups[g] = [];
        groups[g].push(r);
    });

    // Define Group Order
    const groupOrder = ['Common', 'Conditions', 'Weather', 'Cargo Operation', 'Cargo Monitoring', 'Engine', 'Consumable', 'ETC'];
    const sortedGroups = Object.keys(groups).sort((a, b) => {
        const ia = groupOrder.indexOf(a);
        const ib = groupOrder.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    // Sort items within groups by Priority
    Object.keys(groups).forEach(g => {
        groups[g].sort((a, b) => (a.priority || 99) - (b.priority || 99));
    });

    return (
        <div ref={ref} className="bg-white text-black p-8 font-serif print-container">
            <style type="text/css" media="print">
                {`
                @page { size: A4; margin: 20mm; }
                .print-container { -webkit-print-color-adjust: exact; }
                `}
            </style>

            {/* HEADER */}
            <div className="border-b-2 border-slate-800 pb-6 mb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold uppercase tracking-wider text-slate-800">Event Report</h1>
                    <div className="flex items-center gap-4 mt-2 text-slate-600">
                        <span className="flex items-center gap-2 font-medium"><ShipIcon size={18} /> {ship.name}</span>
                        <span className="w-px h-4 bg-slate-300"></span>
                        <span className="font-medium">{codes.evCodes.find(e => e.code === report.evCode)?.name || report.evCode}</span>
                        <span className="w-px h-4 bg-slate-300"></span>
                        <span className="font-medium">{codes.mCodes.find(m => m.code === report.mCode)?.name || report.mCode}</span>
                        <span className="w-px h-4 bg-slate-300"></span>
                        <span className="font-medium text-emerald-700">{report.id}</span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-sm text-slate-500 uppercase">Report Date</div>
                    <div className="text-xl font-bold font-mono">{report.items['R003'] || report.submittedAt?.substring(0, 10)}</div>
                    <div className="text-xs text-slate-400 mt-1">Voyage: {report.items['R005'] || 'N/A'}</div>
                </div>
            </div>

            {/* BODY GRID */}
            <div className="space-y-8">

                {/* TIMELINE (TASKS) */}
                {report.tasks && Object.keys(report.tasks).length > 0 && (
                    <section className="break-inside-avoid">
                        <h2 className="text-lg font-bold border-l-4 border-slate-800 pl-3 mb-4 uppercase text-slate-700">Timeline</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4">
                            {Object.entries(report.tasks)
                                .sort(([k1], [k2]) => k1.localeCompare(k2))
                                .map(([key, value]) => {
                                    const tDef = codes.tCodes.find(t => t.code === key);
                                    if (!tDef || !value) return null;
                                    return (
                                        <div key={key} className="border-l border-slate-200 pl-3 py-1">
                                            <div className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">{tDef.name}</div>
                                            <div className="font-mono font-medium text-sm">{value as string}</div>
                                        </div>
                                    );
                                })}
                        </div>
                    </section>
                )}

                {/* ITEMS GROUPS */}
                {sortedGroups.map(group => {
                    const items = groups[group].filter(r => report.items[r.code] !== undefined && report.items[r.code] !== '');
                    if (items.length === 0) return null;

                    return (
                        <section key={group} className="break-inside-avoid">
                            <h2 className="text-lg font-bold border-l-4 border-slate-800 pl-3 mb-4 uppercase text-slate-700 bg-slate-100 py-1">{group}</h2>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-4 gap-x-8 px-4">
                                {items.map(r => (
                                    <div key={r.code} className="border-b border-slate-100 pb-1">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <span className="text-xs text-slate-500 font-medium uppercase truncate w-2/3" title={r.name}>{r.name}</span>
                                            {r.unit && !r.unit.includes('YYYY') && <span className="text-[10px] text-slate-400 font-mono">{r.unit}</span>}
                                        </div>
                                        <div className="font-mono text-sm font-semibold text-slate-800 truncate">
                                            {String(report.items[r.code])}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    );
                })}

            </div>

            {/* FOOTER */}
            <div className="mt-12 pt-8 border-t border-slate-200 flex justify-between text-xs text-slate-400 font-mono">
                <div>Generated by SSRPMS</div>
                <div>{new Date().toLocaleString()}</div>
            </div>
        </div>
    );
});

PrintableReport.displayName = 'PrintableReport';

export default PrintableReport;
