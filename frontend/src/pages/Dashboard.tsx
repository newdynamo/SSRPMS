import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Activity, MapPin, Ship as ShipIcon, ChevronRight } from 'lucide-react';
import { fetchShips } from '../api/ships';
import { fetchReports } from '../api/reports';
import { fetchCodes } from '../api/codes';
import type { Ship, Report, CodeData } from '../types';


const Dashboard: React.FC = () => {
    const navigate = useNavigate();

    const [activeShip, setActiveShip] = useState<Ship | null>(null);
    const [ships, setShips] = useState<Ship[]>([]);
    const [reports, setReports] = useState<Report[]>([]);
    const [latestReport, setLatestReport] = useState<Report | null>(null);
    const [evCodes, setEvCodes] = useState<CodeData['evCodes']>([]);


    // Helper to get effective event time from a report
    const getReportTime = (report: Report): number => {
        if (!report) return 0;

        // Try to find a valid T-Code time
        if (report.tasks) {
            // Sort keys to ensure consistent order, find first T-code that isn't T46 (metadata)
            const eventTimeEntry = Object.entries(report.tasks)
                .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                .find(([k, v]) => k.startsWith('T') && k !== 'T46' && v);

            if (eventTimeEntry) {
                return new Date(eventTimeEntry[1]).getTime();
            }
        }

        // Fallback to submittedAt if no event time found
        return report.submittedAt ? new Date(report.submittedAt).getTime() : 0;
    };

    // Derived Values from Latest Report
    const lastEventName = latestReport
        ? (evCodes.find(e => e.code === latestReport.evCode)?.name || latestReport.evCode)
        : 'None';

    const lastEventDateRaw = latestReport ? getReportTime(latestReport) : 0;

    // Format if it's an ISO date string
    const formatTime = (timeStr: string | number) => {
        if (!timeStr) return 'N/A';
        const str = typeof timeStr === 'number' ? new Date(timeStr).toISOString() : timeStr;
        const cleanStr = str.includes('T') ? str.replace('T', ' ') : str;
        // Check if it matches YYYY-MM-DD HH:mm format roughly
        if (cleanStr.match(/^\d{4}-\d{2}-\d{2}/)) {
            return cleanStr.substring(0, 16).replace(/-/g, '.');
        }
        return cleanStr;
    }

    const formattedEventDate = formatTime(lastEventDateRaw > 0 ? new Date(lastEventDateRaw).toISOString() : '');
    const location = latestReport?.items['R006'] as string || 'Unknown';

    useEffect(() => {
        const loadData = async () => {
            try {
                const [shipData, reportData, codeData] = await Promise.all([
                    fetchShips(),
                    fetchReports(),
                    fetchCodes()
                ]);

                setReports(reportData);
                setShips(shipData);
                setEvCodes(codeData.evCodes);
                if (shipData.length > 0) setActiveShip(shipData[0]);


            } catch (err) {
                console.error("Failed to load dashboard data", err);
            }
        };
        loadData();
    }, []);

    useEffect(() => {
        if (!activeShip) {
            setLatestReport(null);
            return;
        }
        // Filter and sort reports
        // R001 is Vessel Name
        const shipReports = reports.filter(r => r.items['R001'] === activeShip.name);
        if (shipReports.length > 0) {
            const sorted = [...shipReports].sort((a, b) => getReportTime(b) - getReportTime(a));
            setLatestReport(sorted[0]);
        } else {
            setLatestReport(null);
        }
    }, [activeShip, reports]);



    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white">Dashboard</h2>
                    <p className="text-slate-400 mt-1">Welcome back. System is ready for reporting.</p>
                </div>

                <div className="flex items-center gap-4">
                    {/* Ship Selector */}
                    <div className="flex items-center gap-3 bg-ocean-800 p-2 rounded-xl border border-ocean-700">
                        <div className="flex items-center gap-2 text-emerald-400 font-medium px-2">
                            <ShipIcon size={18} />
                        </div>
                        <div className="relative">
                            <select
                                value={activeShip?.name || ''}
                                onChange={(e) => {
                                    const selected = ships.find(s => s.name === e.target.value);
                                    if (selected) setActiveShip(selected);
                                }}
                                className="appearance-none bg-ocean-900 border border-ocean-600 text-white pl-3 pr-8 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-medium transition-all hover:border-ocean-500 cursor-pointer text-sm min-w-[160px]"
                            >
                                {ships.map(ship => (
                                    <option key={ship.name} value={ship.name}>
                                        {ship.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" size={14} />
                        </div>
                    </div>


                    <button
                        onClick={() => navigate('/new-report')}
                        className="bg-primary-500 hover:bg-primary-400 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg shadow-primary-500/25 transition-all flex items-center gap-2"
                    >
                        <span>+ New Event Report</span>
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                <StatCard
                    label="Current Status"
                    value={latestReport ? (latestReport.items['R012'] as string || 'At Sea') : 'No Info'}
                    icon={<Activity className="text-emerald-400" />}
                    subtext={latestReport ? `Voyage No. ${latestReport.items['R005'] || '--'}` : 'Select a ship'}
                />
                <StatCard
                    label="Last Event"
                    value={lastEventName}
                    icon={<FileText className="text-blue-400" />}
                    subtext={latestReport ? formattedEventDate : 'No reports found'}
                />
                <StatCard
                    label="Location"
                    value={location}
                    icon={<MapPin className="text-amber-400" />}
                    subtext={latestReport ? `Port: ${latestReport.items['R007'] || latestReport.items['R008'] || '--'}` : 'Position unavailable'}
                />
            </div>

            {/* Recent Activity Section */}
            <div className="bg-ocean-800 rounded-2xl border border-ocean-700 p-6">
                <h3 className="text-xl font-bold text-white mb-4">Recent Activity</h3>
                {latestReport ? (
                    <div className="space-y-4">
                        {reports
                            .filter(r => r.items['R001'] === activeShip?.name)
                            .sort((a, b) => getReportTime(b) - getReportTime(a))
                            .slice(0, 5)
                            .map((report) => {
                                const reportTime = getReportTime(report);
                                const displayTime = formatTime(reportTime > 0 ? new Date(reportTime).toISOString() : '');

                                return (
                                    <div
                                        key={report.id}
                                        className="bg-ocean-900/50 p-4 rounded-xl border border-ocean-600 flex justify-between items-center group hover:border-primary-500/50 transition-colors cursor-pointer"
                                        onClick={() => navigate(`/new-report?edit=${report.id}`)}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-ocean-800 rounded-lg border border-ocean-700 text-primary-400 group-hover:text-primary-300 transition-colors">
                                                <FileText size={24} />
                                            </div>
                                            <div>
                                                <div className="text-white font-bold text-lg">{report.evCode} - {report.mCode}</div>
                                                <div className="text-slate-400 text-sm flex gap-2">
                                                    <span>{displayTime}</span>
                                                    <span className="text-slate-600">•</span>
                                                    <span>{report.items['R001']}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right hidden sm:block">
                                            <div className="text-emerald-400 font-mono text-sm bg-emerald-400/10 px-2 py-1 rounded">
                                                View Details
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                ) : (
                    <div className="h-40 flex items-center justify-center text-slate-500 border border-dashed border-ocean-600 rounded-lg">
                        No recent history loaded for {activeShip?.name || 'selected vessel'}
                    </div>
                )}
            </div>
        </div>
    );
};

const StatCard = ({ label, value, icon, subtext }: { label: string; value: string; icon: React.ReactNode; subtext?: string }) => (
    <div className="bg-ocean-800 p-6 rounded-2xl border border-ocean-700 hover:border-ocean-600 transition-colors">
        <div className="flex items-start justify-between mb-4">
            <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">{label}</span>
            <div className="p-2 bg-ocean-900 rounded-lg">
                {icon}
            </div>
        </div>
        <div className="text-2xl font-bold text-white mb-1 truncate" title={value}>{value}</div>
        {subtext && <div className="text-sm text-slate-500 truncate" title={subtext}>{subtext}</div>}
    </div>
);

export default Dashboard;
