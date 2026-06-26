import React, { useEffect, useState } from "react";
import { Archive, RotateCcw, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { api, fmtDate } from "../api/client.js";
import MetricCard from "../components/MetricCard.jsx";
import { DecisionBadge, StatusDot } from "../components/StatusBadge.jsx";

export default function ModelRegistry({ model }) {
  const [versions, setVersions]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [rolling, setRolling]     = useState(null);
  const [toast, setToast]         = useState(null);

  const load = async () => {
    setLoading(true);
    const v = await api.modelVersions(model);
    setVersions(v);
    setLoading(false);
  };

  useEffect(() => { load(); }, [model]);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const handleRollback = async (version) => {
    if (!window.confirm(`Roll back to ${version}? The current Production model will be archived.`)) return;
    setRolling(version);
    try {
      await api.rollback(model, version);
      showToast(`Rolled back to ${version} successfully`, true);
      load();
    } catch {
      showToast(`Rollback failed — check backend logs`, false);
    } finally {
      setRolling(null);
    }
  };

  const prod      = versions.find(v => v.status === "Production");
  const archived  = versions.filter(v => v.status === "Archived");
  const bestF1    = versions.length ? Math.max(...versions.map(v => v.f1_score).filter(Boolean)) : null;

  const stageIcon = (s) => {
    if (s === "Production") return <CheckCircle size={13} className="text-green-400" />;
    if (s === "Archived")   return <Archive     size={13} className="text-slate-500" />;
    return <Clock size={13} className="text-amber-400" />;
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-in]">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg
                        border ${toast.ok ? "bg-green-500/10 border-green-500/30 text-green-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
          {toast.msg}
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold text-slate-100">Model Registry</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          MLflow-versioned models — rollback is one click, zero redeploy, zero downtime
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Versions"   value={versions.length}           sub="In registry"          icon={Archive}      color="indigo" />
        <MetricCard label="Production"       value={prod?.version ?? "—"}      sub="Currently serving"    icon={CheckCircle}  color="green"  />
        <MetricCard label="Best F1"          value={bestF1?.toFixed(3) ?? "—"} sub="Across all versions"  icon={CheckCircle}  color="purple" />
        <MetricCard label="Archived"         value={archived.length}           sub="Available for rollback" icon={Archive}    color="sky"   />
      </div>

      {/* Production card highlight */}
      {prod && (
        <div className="card p-5 border-green-500/20 glow-indigo">
          <div className="flex items-center gap-2 mb-4">
            <div className="relative w-3 h-3">
              <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-30" />
              <span className="relative block w-3 h-3 rounded-full bg-green-400" />
            </div>
            <span className="text-sm font-semibold text-green-400">Current Production Model</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Version</p>
              <p className="text-2xl font-bold font-mono text-slate-100">{prod.version}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">F1 Score</p>
              <p className="text-2xl font-bold font-mono text-green-400">{prod.f1_score?.toFixed(3) ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Accuracy</p>
              <p className="text-2xl font-bold font-mono text-indigo-400">{prod.accuracy?.toFixed(3) ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">AUC</p>
              <p className="text-2xl font-bold font-mono text-purple-400">{prod.roc_auc?.toFixed(3) ?? "—"}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Registered: <span className="font-mono text-slate-400">{fmtDate(prod.created_at)}</span>
            {prod.run_id && <span className="ml-4">Run: <span className="font-mono">{prod.run_id?.slice(0, 12)}…</span></span>}
          </p>
        </div>
      )}

      {/* All versions table */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-200">All Model Versions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {["Version", "Status", "F1 Score", "Accuracy", "AUC", "Decision", "Registered", "Action"].map(h => (
                  <th key={h} className="table-header px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-xs">Loading…</td></tr>
              ) : versions.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-xs">No versions registered yet — run train_baseline.py</td></tr>
              ) : versions.map((v, i) => (
                <tr key={i} className={`table-row ${v.status === "Production" ? "bg-green-500/5" : ""}`}>
                  <td className="px-4 py-3 text-sm font-bold font-mono text-slate-100">{v.version}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {stageIcon(v.status)}
                      <span className={`text-xs font-medium ${v.status === "Production" ? "text-green-400" : "text-slate-500"}`}>
                        {v.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-200">{v.f1_score?.toFixed(3) ?? "—"}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-200">{v.accuracy?.toFixed(3) ?? "—"}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-200">{v.roc_auc?.toFixed(3) ?? "—"}</td>
                  <td className="px-4 py-3"><DecisionBadge decision={v.decision} /></td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-400 whitespace-nowrap">{fmtDate(v.created_at)}</td>
                  <td className="px-4 py-3">
                    {v.status !== "Production" && (
                      <button
                        onClick={() => handleRollback(v.version)}
                        disabled={rolling === v.version}
                        className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300
                                   border border-amber-500/30 hover:border-amber-400/50
                                   px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                      >
                        <RotateCcw size={11} className={rolling === v.version ? "animate-spin" : ""} />
                        Rollback
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rollback explanation */}
      <div className="card p-4 border-indigo-500/20">
        <p className="text-xs font-semibold text-indigo-400 mb-2">How Rollback Works</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          Clicking Rollback transitions the selected version to <span className="font-mono text-slate-300">Production</span> in the MLflow registry
          and archives the current production model. The FastAPI serving layer polls the registry every 5 minutes and picks up the new
          Production version automatically — <strong className="text-slate-300">no restart or redeploy required</strong>.
          Every rollback is written to the audit log with a timestamp and operator note.
        </p>
      </div>
    </div>
  );
}
