import React, { useEffect, useState } from "react";
import {
  Activity, TrendingUp, RefreshCw, Zap, ShieldCheck,
  AlertTriangle, Clock, BarChart2,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { api, fmtDate, fmtPct } from "../api/client.js";
import MetricCard from "../components/MetricCard.jsx";
import { EventBadge, StatusDot } from "../components/StatusBadge.jsx";
import PipelineStatus from "../components/PipelineStatus.jsx";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs space-y-1">
      <p className="text-slate-400">{label}</p>
      <p className="text-indigo-300 font-mono">Drift: {(payload[0].value * 100).toFixed(1)}%</p>
    </div>
  );
};

export default function Overview({ model }) {
  const [drift, setDrift]       = useState([]);
  const [retrain, setRetrain]   = useState([]);
  const [audit, setAudit]       = useState([]);
  const [status, setStatus]     = useState(null);
  const [loading, setLoading]   = useState(true);

  const load = async () => {
    setLoading(true);
    const [d, r, a, s] = await Promise.all([
      api.driftHistory(model, 20),
      api.retrainHistory(model, 5),
      api.auditLog(model, 8),
      api.systemStatus(),
    ]);
    setDrift([...d].reverse());
    setRetrain(r);
    setAudit(a);
    setStatus(s);
    setLoading(false);
  };

  useEffect(() => { load(); }, [model]);

  const modelStatus = status?.models?.[model];
  const lastDrift   = modelStatus?.last_drift_share;
  const prodVersion = modelStatus?.prod_version;
  const driftStatus = modelStatus?.last_drift_status;

  const latestF1 = retrain.find(r => r.decision === "PROMOTED")?.candidate_f1;
  const totalPromotions = retrain.filter(r => r.decision === "PROMOTED").length;
  const totalRejections = retrain.filter(r => r.decision === "REJECTED").length;

  const chartData = drift.map(d => ({
    name: fmtDate(d.ts).split(",")[0],
    drift: d.drift_share,
    status: d.status,
  }));

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-in]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Overview</h1>
        <p className="text-sm text-slate-400 mt-0.5">Self-healing MLOps pipeline — real-time status</p>
      </div>

      {/* Pipeline status strip */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Pipeline Status</p>
        <PipelineStatus driftStatus={driftStatus} retraining={false} />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Prod Version"
          value={prodVersion ?? "—"}
          sub="MLflow Registry"
          icon={BarChart2}
          color="indigo"
        />
        <MetricCard
          label="Current F1 Score"
          value={latestF1 ? latestF1.toFixed(3) : "—"}
          sub="Holdout benchmark"
          icon={TrendingUp}
          color="green"
        />
        <MetricCard
          label="Drift Share"
          value={lastDrift != null ? fmtPct(lastDrift) : "—"}
          sub={`Status: ${driftStatus ?? "unknown"}`}
          icon={Activity}
          color={driftStatus === "drifting" ? "red" : "green"}
        />
        <MetricCard
          label="Retrains"
          value={`${totalPromotions}P / ${totalRejections}R`}
          sub="Promoted / Rejected"
          icon={RefreshCw}
          color="purple"
        />
      </div>

      {/* Drift sparkline + Activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Drift chart */}
        <div className="card lg:col-span-3">
          <div className="card-header flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200">Recent Drift — Last 20 Batches</span>
            <span className={`badge ${driftStatus === "drifting" ? "badge-alert" : "badge-ok"}`}>
              <StatusDot status={driftStatus || "unknown"} size={6} />
              {driftStatus === "drifting" ? "Drifting" : "Stable"}
            </span>
          </div>
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="driftGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={v => `${(v*100).toFixed(0)}%`} domain={[0, 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0.30} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "Threshold", fontSize: 9, fill: "#ef4444", position: "insideTopRight" }} />
                <Area type="monotone" dataKey="drift" stroke="#6366f1" strokeWidth={2} fill="url(#driftGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity feed */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <span className="text-sm font-semibold text-slate-200">Recent Activity</span>
          </div>
          <div className="divide-y divide-slate-700/40">
            {loading ? (
              <div className="p-4 text-center text-slate-500 text-xs">Loading…</div>
            ) : audit.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-xs">No events yet</div>
            ) : audit.map((e, i) => (
              <div key={i} className="px-4 py-2.5 flex gap-3 items-start hover:bg-slate-800/40 transition-colors">
                <div className="mt-0.5 flex-shrink-0">
                  <EventBadge event={e.event} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{e.message}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{fmtDate(e.ts)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Retrain summary table */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-200">Recent Retrain Decisions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {["Date", "Trigger", "Candidate F1", "Prod F1", "Decision", "Version", "Duration"].map(h => (
                  <th key={h} className="table-header px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {retrain.map((r, i) => (
                <tr key={i} className="table-row">
                  <td className="px-4 py-2.5 text-xs text-slate-300 font-mono whitespace-nowrap">{fmtDate(r.ts)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{r.trigger_reason}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-200">{r.candidate_f1?.toFixed(3) ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-200">{r.prod_f1?.toFixed(3) ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={r.decision === "PROMOTED" ? "badge-ok" : "badge-alert"}>
                      {r.decision}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-indigo-400">{r.new_version}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{r.duration_secs ? `${r.duration_secs}s` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Services status */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Service Health</p>
        <div className="flex flex-wrap gap-4">
          {Object.entries(status?.services || {}).map(([svc, s]) => (
            <div key={svc} className="flex items-center gap-2 text-xs">
              <StatusDot status={s} />
              <span className="text-slate-300 capitalize font-mono">{svc}</span>
              <span className={s === "up" ? "text-green-400" : s === "degraded" ? "text-amber-400" : "text-red-400"}>{s}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs">
            <StatusDot status="ok" />
            <span className="text-slate-300 font-mono">redis</span>
            <span className="text-green-400">up</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <StatusDot status="ok" />
            <span className="text-slate-300 font-mono">celery</span>
            <span className="text-green-400">up</span>
          </div>
        </div>
      </div>
    </div>
  );
}
