import React, { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, AreaChart, Area, ReferenceLine,
} from "recharts";
import { ShieldCheck, AlertTriangle, Database, CheckCircle } from "lucide-react";
import { api, fmtDate, fmtPct } from "../api/client.js";
import MetricCard from "../components/MetricCard.jsx";

export default function DataQuality({ model }) {
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [maxRate, setMaxRate] = useState(0.15);

  const load = async () => {
    setLoading(true);
    const [q, cfg] = await Promise.all([api.dataQuality(model, 50), api.config()]);
    setData([...q].reverse());
    setMaxRate(cfg?.[model]?.max_rejection_rate ?? 0.15);
    setLoading(false);
  };

  useEffect(() => { load(); }, [model]);

  const totalRows      = data.reduce((s, d) => s + (d.total_rows || 0), 0);
  const totalClean     = data.reduce((s, d) => s + (d.clean_rows || 0), 0);
  const totalBad       = data.reduce((s, d) => s + (d.quarantined_rows || 0), 0);
  const avgRate        = data.length ? data.reduce((s, d) => s + d.rejection_rate, 0) / data.length : 0;
  const alertBatches   = data.filter(d => d.status === "quarantined");

  const chartData = data.map((d, i) => ({
    label: `B${i + 1}`,
    rejection_rate: parseFloat((d.rejection_rate * 100).toFixed(2)),
    clean: d.clean_rows,
    quarantined: d.quarantined_rows,
    status: d.status,
  }));

  const healthData = data.map((d, i) => ({
    label: `B${i + 1}`,
    health: parseFloat((100 - d.rejection_rate * 100).toFixed(2)),
  }));

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-in]">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Data Quality</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Schema validation runs before every drift check. Rejection rate &gt;{" "}
          <span className="font-mono text-amber-400">{(maxRate * 100).toFixed(0)}%</span>{" "}
          raises a DATA_QUALITY_ALERT instead of triggering retraining.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Rows Seen"  value={totalRows.toLocaleString()}         sub="Across all batches" icon={Database}     color="indigo" />
        <MetricCard label="Clean Rows"       value={totalClean.toLocaleString()}        sub={`${fmtPct(totalClean / Math.max(totalRows,1))} pass rate`} icon={CheckCircle} color="green" />
        <MetricCard label="Quarantined"      value={totalBad.toLocaleString()}          sub={`${fmtPct(totalBad / Math.max(totalRows,1))} rejected`} icon={AlertTriangle} color={totalBad > 0 ? "amber" : "green"} />
        <MetricCard label="Quality Alerts"   value={alertBatches.length}               sub={`Batches above ${(maxRate*100).toFixed(0)}%`} icon={ShieldCheck} color={alertBatches.length > 0 ? "red" : "green"} />
      </div>

      {/* Rejection rate over time */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-200">Rejection Rate per Batch</span>
          <span className="text-xs text-slate-500">Alert threshold: <span className="font-mono text-amber-400">{(maxRate * 100).toFixed(0)}%</span></span>
        </div>
        <div className="p-5 h-56">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="card px-3 py-2 text-xs space-y-1">
                        <p className="text-slate-400">{d.label}</p>
                        <p className="text-amber-300">Rejection: {d.rejection_rate}%</p>
                        <p className="text-green-400">Clean: {d.clean}</p>
                        <p className="text-red-400">Quarantined: {d.quarantined}</p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={maxRate * 100} stroke="#f59e0b" strokeDasharray="5 5" strokeOpacity={0.8} />
                <Bar dataKey="rejection_rate" radius={[3, 3, 0, 0]} maxBarSize={18}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.status === "quarantined" ? "#ef4444" : "#6366f1"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Batch health trend */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-200">Batch Health Score (100% − Rejection Rate)</span>
        </div>
        <div className="p-5 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={healthData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fontSize: 8, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} domain={[80, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} formatter={(v) => [`${v}%`, "Health"]} />
              <Area type="monotone" dataKey="health" stroke="#22c55e" strokeWidth={2} fill="url(#healthGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alert batches */}
      {alertBatches.length > 0 && (
        <div className="card border-amber-500/30">
          <div className="card-header flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">
              DATA_QUALITY_ALERT — {alertBatches.length} batch{alertBatches.length > 1 ? "es" : ""} above threshold
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  {["Time", "Batch ID", "Total", "Clean", "Quarantined", "Rejection Rate", "Note"].map(h => (
                    <th key={h} className="table-header px-4 py-2.5 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alertBatches.map((d, i) => (
                  <tr key={i} className="border-b border-amber-500/10 hover:bg-amber-500/5 transition-colors">
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-400 whitespace-nowrap">{fmtDate(d.ts)}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-300">{d.batch_id}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-300">{d.total_rows}</td>
                    <td className="px-4 py-2.5 text-xs text-green-400">{d.clean_rows}</td>
                    <td className="px-4 py-2.5 text-xs text-red-400">{d.quarantined_rows}</td>
                    <td className="px-4 py-2.5">
                      <span className="badge-alert text-xs font-mono">{fmtPct(d.rejection_rate)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">Drift check skipped — DATA_QUALITY_ALERT raised</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full batch log */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-200">Full Batch Quality Log</span>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#111827] z-10">
              <tr className="border-b border-slate-700/50">
                {["Time", "Batch ID", "Total", "Clean", "Quarantined", "Rejection %", "Status"].map(h => (
                  <th key={h} className="table-header px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d, i) => (
                <tr key={i} className="table-row">
                  <td className="px-4 py-2 text-xs font-mono text-slate-400 whitespace-nowrap">{fmtDate(d.ts)}</td>
                  <td className="px-4 py-2 text-xs font-mono text-slate-300">{d.batch_id}</td>
                  <td className="px-4 py-2 text-xs text-slate-300">{d.total_rows}</td>
                  <td className="px-4 py-2 text-xs text-green-400">{d.clean_rows}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{d.quarantined_rows}</td>
                  <td className="px-4 py-2 text-xs font-mono">
                    <span className={d.rejection_rate > maxRate ? "text-red-400" : "text-slate-300"}>
                      {fmtPct(d.rejection_rate)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={d.status === "quarantined" ? "badge-alert" : "badge-ok"}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
