import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, History, Activity, Settings, Ship, LineChart, Menu, X, Gauge } from 'lucide-react';
import { cn } from '../utils/cn';

interface LayoutProps {
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen bg-ocean-900 text-slate-200 overflow-hidden relative">
            {/* Mobile Header */}
            <div className="lg:hidden absolute top-4 left-4 z-40">
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-2 bg-ocean-800 border border-ocean-700 rounded-lg text-white shadow-lg"
                >
                    <Menu size={24} />
                </button>
            </div>

            {/* Mobile Backdrop */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={cn(
                "w-64 bg-ocean-800 border-r border-ocean-700 flex flex-col absolute lg:relative z-50 h-full transition-transform duration-300 ease-in-out",
                isSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0 lg:shadow-none"
            )}>
                <div className="p-6 border-b border-ocean-700 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/20">
                            <Ship className="text-white w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg tracking-tight text-white">SSRPMS</h1>
                            <p className="text-xs text-slate-400">Event Recording</p>
                        </div>
                    </div>
                    {/* Close Button (Mobile) */}
                    <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <NavItem to="/" icon={<LayoutDashboard />} label="Dashboard" onClick={() => setIsSidebarOpen(false)} />
                    <NavItem to="/new-report" icon={<FileText />} label="New Report" onClick={() => setIsSidebarOpen(false)} />
                    <NavItem to="/history" icon={<History />} label="History" onClick={() => setIsSidebarOpen(false)} />
                    <NavItem to="/monitoring" icon={<Activity />} label="Monitoring" onClick={() => setIsSidebarOpen(false)} />
                    <NavItem to="/foc-analysis" icon={<LineChart />} label="FOC Analysis" onClick={() => setIsSidebarOpen(false)} />
                    <NavItem to="/me-analysis" icon={<Gauge />} label="M/E Analysis" onClick={() => setIsSidebarOpen(false)} />
                </nav>

                <div className="p-4 border-t border-ocean-700">
                    <NavItem to="/settings" icon={<Settings />} label="Settings" onClick={() => setIsSidebarOpen(false)} />
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-ocean-900 relative">
                {/* Background ambient glow */}
                <div className="absolute top-0 left-0 w-full h-96 bg-primary-500/5 blur-[120px] pointer-events-none" />

                <div className="p-8 relative z-10 w-full max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
};

const NavItem = ({ to, icon, label, onClick }: { to: string; icon: React.ReactNode; label: string; onClick?: () => void }) => (
    <NavLink
        onClick={onClick}
        to={to}
        className={({ isActive }) => cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
            isActive
                ? "bg-primary-500 text-white shadow-lg shadow-primary-500/25"
                : "text-slate-400 hover:bg-ocean-700 hover:text-slate-100"
        )}
    >
        {React.cloneElement(icon as React.ReactElement<{ size: number }>, { size: 20 })}
        <span className="font-medium">{label}</span>
    </NavLink>
);

export default Layout;
