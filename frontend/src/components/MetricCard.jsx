import React from "react";

export default function MetricCard({ label, value, sub, icon: Icon, color = "indigo", trend, className = "" }) {
  const colorMap = {
    indigo: "text-indigo-400 bg-indigo-500/10",
    green:  "text-green-400 bg-green-500/10",
    amber:  "text-amber-400 bg-amber-500/10",
    red:    "text-red-400 bg-red-500/10",
    sky:    "text-sky-400 bg-sky-500/10",
    purple: "text-purple-400 bg-purple-500/10",
  };
  const cls = colorMap[color] || colorMap.indigo;

  return (
    <div className={`metric-card animate-[fadeIn_0.3s_ease-in] ${className}`}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        {Icon && (
          <span className={`p-2 rounded-lg ${cls}`}>
            <Icon size={14} />
          </span>
        )}
      </div>
      <div className="flex items-end gap-2 mt-1">
        <span className="text-2xl font-bold text-slate-100 font-mono leading-none">{value ?? "—"}</span>
        {trend !== undefined && trend !== null && (
          <span className={`text-xs font-medium mb-0.5 ${trend >= 0 ? "text-green-400" : "text-red-400"}`}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(3)}
          </span>
        )}
      </div>
      {sub && <span className="text-xs text-slate-500 mt-0.5">{sub}</span>}
    </div>
  );
}
