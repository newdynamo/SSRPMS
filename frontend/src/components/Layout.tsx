import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, History, Settings, Ship } from 'lucide-react';
import { cn } from '../utils/cn';

interface LayoutProps {
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
    return (
        <div className="flex h-screen bg-ocean-900 text-slate-200 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-ocean-800 border-r border-ocean-700 flex flex-col">
                <div className="p-6 border-b border-ocean-700 flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/20">
                        <Ship className="text-white w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight text-white">SSRPMS</h1>
                        <p className="text-xs text-slate-400">Event Recording</p>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <NavItem to="/" icon={<LayoutDashboard />} label="Dashboard" />
                    <NavItem to="/new-report" icon={<FileText />} label="New Report" />
                    <NavItem to="/history" icon={<History />} label="History" />
                </nav>

                <div className="p-4 border-t border-ocean-700">
                    <NavItem to="/settings" icon={<Settings />} label="Settings" />
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

const NavItem = ({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) => (
    <NavLink
        to={to}
        className={({ isActive }) => cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
            isActive
                ? "bg-primary-500 text-white shadow-lg shadow-primary-500/25"
                : "text-slate-400 hover:bg-ocean-700 hover:text-slate-100"
        )}
    >
        {React.cloneElement(icon as React.ReactElement<any>, { size: 20 })}
        <span className="font-medium">{label}</span>
    </NavLink>
);

export default Layout;
