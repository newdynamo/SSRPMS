import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchReports, deleteReport, submitReport, updateReport } from '../api/reports';
import { fetchShips } from '../api/ships';
import { fetchCodes } from '../api/codes';
import type { Report, Ship, CodeData } from '../types';
import { Trash2, Edit, FileText, Calendar, Ship as ShipIcon, Printer, Download, Upload, FileSpreadsheet } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import PrintableReport from '../components/PrintableReport';
import { exportReportsToExcel, generateExcelTemplate, parseExcelReports } from '../utils/excel';


const History: React.FC = () => {
    const navigate = useNavigate();
    const [reports, setReports] = useState<Report[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [ships, setShips] = useState<Ship[]>([]);
    const [codes, setCodes] = useState<CodeData | null>(null);
    const [selectedShip, setSelectedShip] = useState<string>('All');

    // Printing State
    const [printReport, setPrintReport] = useState<Report | null>(null);
    const printRef = React.useRef<HTMLDivElement>(null);

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: printReport ? `${printReport.items['R001']}_${printReport.evCode}_Report` : 'Event_Report',
        onAfterPrint: () => setPrintReport(null) // Reset after print
    });

    // Effect to trigger print when printReport state is set
    useEffect(() => {
        if (printReport && codes && printRef.current) {
            handlePrint();
        }
    }, [printReport, codes]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [reportData, shipData, codeData] = await Promise.all([
                fetchReports(),
                fetchShips(),
                fetchCodes()
            ]);

            setShips(shipData);
            setCodes(codeData);
            setReports(sortReports(reportData));
        } catch (err) {
            console.error("Failed to load history data", err);
        } finally {
            setIsLoading(false);
        }
    };

    const getEventTime = (report: Report): number => {
        if (report.tasks) {
            const taskTime = Object.entries(report.tasks)
                .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                .find(([k, v]) => k.startsWith('T') && k !== 'T46' && v)?.[1];
            if (taskTime) return new Date(taskTime).getTime();
        }
        return new Date(report.submittedAt || 0).getTime();
    };

    const sortReports = (data: Report[]) => {
        return [...data].sort((a, b) => getEventTime(b) - getEventTime(a));
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this report? This action cannot be undone.')) return;
        try {
            await deleteReport(id);
            setReports(reports.filter(r => r.id !== id));
        } catch (err) {
            alert('Failed to delete report');
            loadData();
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !codes) return;

        if (!confirm(`Importing ${file.name}. This will create new reports or update existing ones (if ID matches). Continue?`)) {
            e.target.value = ''; // Reset input
            return;
        }

        try {
            setIsLoading(true);
            const importedReports = await parseExcelReports(file);

            let successCount = 0;
            let failCount = 0;

            for (const report of importedReports) {
                try {
                    // If ID exists and is valid, try update, else create
                    if (report.id && reports.some(r => r.id === report.id)) {
                        // For update we need to cast to full Report or handle Partial properly
                        // API expects full object usually, but let's assume partial update is okay or we merge
                        // For simplicity in this bulk import, we might just call save which might handle upsert if backend supported it, 
                        // but our backend separates POST (create) and PUT (update).
                        await updateReport(report.id, report as Report);
                    } else {
                        // Create new
                        // Remove ID if it was just a placeholder or undefined, let backend/logic assign if needed, 
                        // but if we want to preserve ID from excel (e.g. migration), we keep it. 
                        // Our backend POST generates a NEW ID usually. 
                        // If we want to strictly import what's in excel including ID, we might need a different backend endpoint or Modify POST.
                        const { id, ...newReportData } = report; // Strip ID to force creation of new entry
                        await submitReport(newReportData as Report);
                    }
                    successCount++;
                } catch (err) {
                    console.error("Failed to save report", report, err);
                    failCount++;
                }
            }

            alert(`Import Complete.\nResult: ${successCount} succeeded, ${failCount} failed.`);
            loadData(); // Refresh list
        } catch (err) {
            console.error(err);
            alert('Failed to parse or import Excel file.');
        } finally {
            setIsLoading(false);
            e.target.value = ''; // Reset input
        }
    };

    const handleEdit = (id: string) => {
        navigate(`/new-report?edit=${id}`);
    };

    const filteredReports = selectedShip === 'All'
        ? reports
        : reports.filter(r => r.items['R001'] === selectedShip);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white">History</h2>
                    <p className="text-slate-400 mt-1">View and manage past event reports.</p>
                </div>

                {/* Ship Filter */}
                <div className="flex items-center gap-3 bg-ocean-800 p-2 rounded-xl border border-ocean-700">
                    <div className="flex items-center gap-2 text-emerald-400 font-medium px-2">
                        <ShipIcon size={18} />
                    </div>
                    <select
                        value={selectedShip}
                        onChange={(e) => setSelectedShip(e.target.value)}
                        className="appearance-none bg-ocean-900 border border-ocean-600 text-white pl-3 pr-8 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-medium transition-all hover:border-ocean-500 cursor-pointer text-sm min-w-[160px]"
                    >
                        <option value="All">All Vessels</option>
                        {ships.map(ship => (
                            <option key={ship.name} value={ship.name}>
                                {ship.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Excel Actions */}
                <div className="flex gap-2">
                    <button
                        onClick={() => codes && exportReportsToExcel(filteredReports, codes)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium text-sm shadow-lg shadow-emerald-900/20"
                        title="Download current view as Excel"
                    >
                        <Download size={16} /> Export
                    </button>
                    <button
                        onClick={() => document.getElementById('excel-upload')?.click()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium text-sm shadow-lg shadow-blue-900/20"
                        title="Upload Excel to create/update reports"
                    >
                        <Upload size={16} /> Import
                    </button>
                    <input
                        type="file"
                        id="excel-upload"
                        accept=".xlsx, .xls"
                        className="hidden"
                        onChange={handleImport}
                    />
                    <button
                        onClick={() => codes && generateExcelTemplate(codes)}
                        className="flex items-center gap-2 px-4 py-2 bg-ocean-700 hover:bg-ocean-600 text-slate-300 hover:text-white rounded-lg transition-colors font-medium text-sm border border-ocean-600"
                        title="Download blank Excel template"
                    >
                        <FileSpreadsheet size={16} /> Template
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="text-white">Loading history...</div>
            ) : (
                <div className="space-y-4">
                    {filteredReports.length === 0 ? (
                        <div className="text-slate-500 text-center py-10 border border-dashed border-ocean-700 rounded-xl">
                            No reports found {selectedShip !== 'All' ? `for ${selectedShip}` : ''}.
                        </div>
                    ) : (
                        filteredReports.map((report) => {
                            const eventTimeRaw = report.tasks
                                ? (Object.entries(report.tasks)
                                    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                                    .find(([k, v]) => k.startsWith('T') && k !== 'T46' && v)?.[1])
                                : null;

                            const formatTime = (isoString: string) => {
                                if (!isoString) return '';
                                const dateStr = isoString.includes('T') ? isoString.replace('T', ' ') : isoString;
                                if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                                    return dateStr.substring(0, 16).replace(/-/g, '.');
                                }
                                return dateStr;
                            };

                            const displayTime = eventTimeRaw
                                ? formatTime(eventTimeRaw)
                                : formatTime(report.submittedAt || '');

                            return (
                                <div key={report.id} className="bg-ocean-800 p-6 rounded-2xl border border-ocean-700 hover:border-ocean-600 transition-all group relative">
                                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 bg-ocean-900 rounded-xl text-primary-400 border border-ocean-700">
                                                <FileText size={24} />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                                    {codes?.evCodes.find(e => e.code === report.evCode)?.name || report.evCode}
                                                    <span className="text-emerald-400">
                                                        - {codes?.mCodes.find(m => m.code === report.mCode)?.name || report.mCode}
                                                    </span>
                                                </h3>
                                                <div className="flex items-center gap-4 text-sm text-slate-400 mt-1">
                                                    <div className="flex items-center gap-1">
                                                        <Calendar size={14} />
                                                        {displayTime}
                                                    </div>
                                                    <div className="w-1 h-1 rounded-full bg-slate-600"></div>
                                                    <div>{report.items['R001'] || 'Unknown Vessel'}</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => setPrintReport(report)}
                                                className="flex items-center gap-2 px-4 py-2 bg-ocean-700 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium text-sm"
                                                title="Print to PDF"
                                            >
                                                <Printer size={16} /> Print
                                            </button>
                                            <button
                                                onClick={() => handleEdit(report.id!)}
                                                className="flex items-center gap-2 px-4 py-2 bg-ocean-700 hover:bg-primary-500 text-white rounded-lg transition-colors font-medium text-sm"
                                            >
                                                <Edit size={16} /> Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(report.id!)}
                                                className="flex items-center gap-2 px-4 py-2 bg-ocean-700 hover:bg-rose-500 text-white rounded-lg transition-colors font-medium text-sm"
                                            >
                                                <Trash2 size={16} /> Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Hidden Print Component */}
            <div style={{ display: 'none' }}>
                {printReport && codes && (
                    <PrintableReport
                        ref={printRef}
                        report={printReport}
                        ship={ships.find(s => s.name === printReport.items['R001']) || { name: 'Unknown', code: 'UNK' } as Ship}
                        codes={codes}
                    />
                )}
            </div>
        </div>
    );
};

export default History;
