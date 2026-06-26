import React, { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, ReferenceLine, Cell,
} from "recharts";
import { TrendingUp, Award, XCircle, Clock } from "lucide-react";
import { api, fmtDate } from "../api/client.js";
import MetricCard from "../components/MetricCard.jsx";
import { DecisionBadge } from "../components/StatusBadge.jsx";

const TTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs space-y-1">
      <p className="text-slate-400">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-mono">{typeof p.value === "number" ? p.value.toFixed(3) : p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function Performance({ model }) {
  const [runs, setRuns]     = useState([]);
  const [retrain, setRetrain] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [r, rt] = await Promise.all([
      api.performanceHistory(model),
      api.retrainHistory(model, 20),
    ]);
    setRuns(r);
    setRetrain(rt);
    setLoading(false);
  };

  useEffect(() => { load(); }, [model]);

  // Build chart data from perf history + retrain decisions
  const chartData = runs
    .map(r => ({
      date: fmtDate(r.start_time).split(",")[0],
      f1:   r["metrics.f1_score"] ?? r["metrics.candidate_f1"],
      acc:  r["metrics.accuracy"],
      auc:  r["metrics.roc_auc"],
      decision: r["tags.decision"],
      name: r["tags.mlflow.runName"] || "run",
    }))
    .filter(r => r.f1 != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Champion-challenger comparison data
  const ccData = retrain.map((r, i) => ({
    name: `RT ${i + 1}`,
    candidate: r.candidate_f1,
    production: r.prod_f1,
    decision: r.decision,
    version: r.new_version,
    ts: fmtDate(r.ts),
  }));

  const bestF1      = chartData.length ? Math.max(...chartData.map(d => d.f1).filter(Boolean)) : null;
  const latestF1    = chartData.at(-1)?.f1;
  const promoted    = retrain.filter(r => r.decision === "PROMOTED").length;
  const rejected    = retrain.filter(r => r.decision === "REJECTED").length;
  const avgDuration = retrain.length
    ? (retrain.reduce((s, r) => s + (r.duration_secs || 0), 0) / retrain.length).toFixed(1)
    : null;

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-in]">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Performance</h1>
        <p className="text-sm text-slate-400 mt-0.5">F1 score, accuracy, and AUC trends across every retrain cycle</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Latest F1"   value={latestF1?.toFixed(3) ?? "—"} sub="Current Production"  icon={TrendingUp} color="green"  />
        <MetricCard label="Best F1"     value={bestF1?.toFixed(3) ?? "—"}   sub="Across all versions" icon={Award}      color="indigo" />
        <MetricCard label="Promotions"  value={promoted}                     sub={`${rejected} rejected`} icon={TrendingUp} color="green" />
        <MetricCard label="Avg Retrain" value={avgDuration ? `${avgDuration}s` : "—"} sub="Training duration" icon={Clock} color="purple" />
      </div>

      {/* F1 / Accuracy / AUC trend */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-200">Metric Trends Across Retrain Cycles</span>
          <div className="flex items-center gap-4 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-indigo-400 inline-block" />F1</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-green-400 inline-block" />Accuracy</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-purple-400 inline-block" />AUC</span>
          </div>
        </div>
        <div className="p-5 h-64">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">No performance data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} domain={[0.75, 1]} tickFormatter={v => v.toFixed(2)} />
                <Tooltip content={<TTip />} />
                <Line type="monotone" dataKey="f1"  stroke="#818cf8" strokeWidth={2.5} dot={{ r: 4, fill: "#818cf8" }} name="F1" />
                <Line type="monotone" dataKey="acc" stroke="#4ade80" strokeWidth={2}   dot={{ r: 3, fill: "#4ade80" }} name="Accuracy" strokeDasharray="4 2" />
                <Line type="monotone" dataKey="auc" stroke="#c084fc" strokeWidth={2}   dot={{ r: 3, fill: "#c084fc" }} name="AUC" strokeDasharray="6 3" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Champion vs Challenger */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-200">Champion vs. Challenger (F1 on Holdout)</span>
          <div className="flex items-center gap-4 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" />Candidate</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-500 inline-block" />Production</span>
          </div>
        </div>
        <div className="p-5 h-60">
          {ccData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">No retrain history yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ccData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} domain={[0.75, 1]} tickFormatter={v => v.toFixed(2)} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="card px-3 py-2 text-xs space-y-1">
                        <p className="text-slate-400">{d.ts}</p>
                        <p className="text-indigo-300">Candidate {d.version}: <span className="font-mono">{d.candidate?.toFixed(3)}</span></p>
                        <p className="text-slate-400">Production: <span className="font-mono">{d.production?.toFixed(3)}</span></p>
                        <DecisionBadge decision={d.decision} />
                      </div>
                    );
                  }}
                />
                <Bar dataKey="candidate"  fill="#6366f1" radius={[3, 3, 0, 0]} name="Candidate" maxBarSize={40} />
                <Bar dataKey="production" fill="#475569" radius={[3, 3, 0, 0]} name="Production" maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Retrain history table */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-200">Full Retrain History</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {["Date", "Version", "Candidate F1", "Prod F1", "Δ F1", "Decision", "Duration", "Trigger"].map(h => (
                  <th key={h} className="table-header px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {retrain.map((r, i) => {
                const delta = r.candidate_f1 != null && r.prod_f1 != null
                  ? (r.candidate_f1 - r.prod_f1) : null;
                return (
                  <tr key={i} className="table-row">
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-400 whitespace-nowrap">{fmtDate(r.ts)}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-indigo-400">{r.new_version}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-200">{r.candidate_f1?.toFixed(3) ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-200">{r.prod_f1?.toFixed(3) ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs font-mono">
                      {delta != null ? (
                        <span className={delta >= 0 ? "text-green-400" : "text-red-400"}>
                          {delta >= 0 ? "+" : ""}{delta.toFixed(3)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5"><DecisionBadge decision={r.decision} /></td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{r.duration_secs ? `${r.duration_secs}s` : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{r.trigger_reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
