import React from "react";
import { RefreshCw, ChevronDown } from "lucide-react";
import { StatusDot } from "./StatusBadge.jsx";

export default function TopBar({ models, selectedModel, setSelectedModel, systemStatus, onRefresh, loading }) {
  const modelStatus = systemStatus?.models?.[selectedModel];
  const isOk = modelStatus?.last_drift_status === "ok";

  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between
                       px-6 bg-[#0d1322] border-b border-slate-700/50 sticky top-0 z-20">
      {/* Model switcher */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Model</span>
        <div className="relative">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="appearance-none bg-slate-800 border border-slate-600 rounded-lg
                       pl-3 pr-8 py-1.5 text-sm text-slate-200 cursor-pointer
                       focus:outline-none focus:ring-2 focus:ring-indigo-500/40
                       focus:border-indigo-500 transition-colors"
          >
            {(models || []).map((m) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-5">
        {/* Drift status indicator */}
        {modelStatus && (
          <div className="flex items-center gap-2 text-xs">
            <StatusDot status={modelStatus.last_drift_status || "unknown"} size={7} />
            <span className="text-slate-400">
              Drift{" "}
              <span className={isOk ? "text-green-400" : "text-red-400"}>
                {modelStatus.last_drift_share != null
                  ? (modelStatus.last_drift_share * 100).toFixed(1) + "%"
                  : "—"}
              </span>
            </span>
          </div>
        )}

        {/* Prod version */}
        {modelStatus?.prod_version && (
          <span className="badge badge-ok text-[10px]">
            {modelStatus.prod_version} · Production
          </span>
        )}

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200
                     hover:bg-slate-700/50 transition-colors disabled:opacity-40"
          title="Refresh data"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
    </header>
  );
}
