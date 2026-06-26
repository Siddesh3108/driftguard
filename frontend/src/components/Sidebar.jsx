import React from "react";
import {
  LayoutDashboard, Activity, TrendingUp, Archive,
  ClipboardList, Zap, BarChart3, Radio, ShieldCheck,
  Settings, ChevronRight,
} from "lucide-react";

const NAV = [
  { id: "overview",    label: "Overview",       Icon: LayoutDashboard, group: "Monitor" },
  { id: "drift",       label: "Drift Monitor",  Icon: Activity },
  { id: "performance", label: "Performance",    Icon: TrendingUp },
  { id: "analytics",   label: "Analytics",      Icon: BarChart3, group: "Analyse" },
  { id: "quality",     label: "Data Quality",   Icon: ShieldCheck },
  { id: "stream",      label: "Stream Monitor", Icon: Radio },
  { id: "registry",    label: "Model Registry", Icon: Archive, group: "Manage" },
  { id: "audit",       label: "Audit Log",      Icon: ClipboardList },
  { id: "predict",     label: "Try It",         Icon: Zap },
  { id: "settings",    label: "Settings",       Icon: Settings, group: "Config" },
];

export default function Sidebar({ page, setPage }) {
  let lastGroup = null;

  return (
    <aside className="w-56 flex-shrink-0 h-screen sticky top-0 flex flex-col
                      bg-[#0d1322] border-r border-slate-700/50 overflow-y-auto">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 flex-shrink-0">
            <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
            <div className="relative w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/50
                            flex items-center justify-center">
              <span className="text-indigo-400 text-sm">📡</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-100 leading-tight">DriftGuard</p>
            <p className="text-[10px] text-slate-500 leading-tight">MLOps Pipeline</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(({ id, label, Icon, group }) => {
          const showGroup = group && group !== lastGroup;
          if (group) lastGroup = group;
          return (
            <React.Fragment key={id}>
              {showGroup && (
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 pt-4 pb-1">
                  {group}
                </p>
              )}
              <button
                onClick={() => setPage(id)}
                className={page === id ? "nav-item-active w-full text-left" : "nav-item-inactive w-full text-left"}
              >
                <Icon size={15} className="flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {page === id && <ChevronRight size={12} className="text-indigo-400/60" />}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-700/50">
        <p className="text-[10px] text-slate-600 font-mono">DriftGuard v1.0</p>
        <p className="text-[10px] text-slate-700 font-mono">Siddesh Lohkare</p>
      </div>
    </aside>
  );
}
