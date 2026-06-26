import React, { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, CartesianGrid, Cell, Legend,
} from "recharts";
import { BarChart3, Activity, Layers, GitBranch } from "lucide-react";
import { api, fmtPct } from "../api/client.js";
import MetricCard from "../components/MetricCard.jsx";

const COLORS = ["#818cf8","#4ade80","#fb923c","#f472b6","#38bdf8","#a78bfa","#34d399"];

export default function Analytics({ model }) {
  const [importance, setImportance] = useState([]);
  const [drift,      setDrift]      = useState([]);
  const [retrain,    setRetrain]    = useState([]);
  const [loading,    setLoading]    = useState(true);

  const load = async () => {
    setLoading(true);
    const [imp, d, rt] = await Promise.all([
      api.featureImportance(model),
      api.driftHistory(model, 50),
      api.retrainHistory(model, 20),
    ]);
    setImportance(imp);
    setDrift(d);
    setRetrain(rt);
    setLoading(false);
  };

  useEffect(() => { load(); }, [model]);

  // Drift × batch index scatter data
  const scatterData = drift.map((d, i) => ({
    batch: i + 1,
    drift: parseFloat((d.drift_share * 100).toFixed(2)),
    status: d.status,
  }));

  // Radar data — feature importance normalised 0–100
  const maxImp = importance.length ? Math.max(...importance.map(f => f.importance)) : 1;
  const radarData = importance.slice(0, 7).map(f => ({
    feature: f.feature.replace(/([A-Z])/g, " $1").trim(),
    importance: parseFloat(((f.importance / maxImp) * 100).toFixed(1)),
  }));

  // Retrain outcome breakdown for a stacked summary
  const promotedF1 = retrain.filter(r => r.decision === "PROMOTED").map(r => r.candidate_f1).filter(Boolean);
  const rejectedF1 = retrain.filter(r => r.decision === "REJECTED").map(r => r.candidate_f1).filter(Boolean);

  const top4 = importance.slice(0, 4);

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-in]">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Analytics</h1>
        <p className="text-sm text-slate-400 mt-0.5">Feature importance, drift correlation, and model behaviour deep-dive</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Features Tracked"  value={importance.length}                              sub="In production model"  icon={Layers}    color="indigo" />
        <MetricCard label="Top Feature"       value={importance[0]?.feature?.slice(0,12) ?? "—"}    sub={importance[0] ? fmtPct(importance[0].importance) : "—"} icon={BarChart3} color="green" />
        <MetricCard label="Avg Drift (all)"   value={drift.length ? fmtPct(drift.reduce((a,b)=>a+b.drift_share,0)/drift.length) : "—"} sub="Mean across batches" icon={Activity}  color="purple" />
        <MetricCard label="Retrain Cycles"    value={retrain.length}                                 sub={`${retrain.filter(r=>r.decision==="PROMOTED").length} promotions`} icon={GitBranch} color="sky" />
      </div>

      {/* Feature Importance Bars + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-semibold text-slate-200">Feature Importance (Production Model)</span>
          </div>
          <div className="p-5 h-64">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">Loading…</div>
            ) : importance.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">Model not loaded</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={importance} layout="vertical" margin={{ left: 10, right: 30, top: 4, bottom: 4 }}>
                  <XAxis type="number" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(2)} />
                  <YAxis type="category" dataKey="feature" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={120} />
                  <Tooltip
                    formatter={(v) => [v.toFixed(4), "Importance"]}
                    contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="importance" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {importance.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="text-sm font-semibold text-slate-200">Feature Importance Radar</span>
          </div>
          <div className="p-5 h-64">
            {radarData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="#1e293b" />
                  <PolarAngleAxis dataKey="feature" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 8, fill: "#64748b" }} tickLine={false} />
                  <Radar name="Importance" dataKey="importance" stroke="#818cf8" fill="#818cf8" fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Drift Scatter: batch vs drift share */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-200">
            Drift Distribution Scatter — Batch Index vs Drift%
          </span>
        </div>
        <div className="p-5 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" dataKey="batch" name="Batch" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} label={{ value: "Batch #", position: "insideBottom", offset: -2, fontSize: 9, fill: "#64748b" }} />
              <YAxis type="number" dataKey="drift" name="Drift %" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3", stroke: "#334155" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="card px-3 py-2 text-xs">
                      <p className="text-slate-400">Batch {d.batch}</p>
                      <p className="text-indigo-300 font-mono">Drift: {d.drift}%</p>
                      <p className={d.status === "drifting" ? "text-red-400" : "text-green-400"}>{d.status}</p>
                    </div>
                  );
                }}
              />
              <Scatter data={scatterData}>
                {scatterData.map((d, i) => (
                  <Cell key={i} fill={d.status === "drifting" ? "#ef4444" : "#6366f1"} fillOpacity={0.8} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="px-5 pb-4 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />Stable</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Drifting</span>
        </div>
      </div>

      {/* Top features highlight cards */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Top Feature Breakdown</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {top4.map((f, i) => (
            <div key={f.feature} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs text-slate-400 font-medium">{f.feature}</span>
                <span className="text-[10px] font-mono text-slate-500">#{i + 1}</span>
              </div>
              <div className="text-xl font-bold font-mono" style={{ color: COLORS[i] }}>
                {(f.importance * 100).toFixed(1)}%
              </div>
              <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(f.importance / importance[0]?.importance) * 100}%`, background: COLORS[i] }}
                />
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5">of total importance</p>
            </div>
          ))}
        </div>
      </div>

      {/* Candidate F1 distribution */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-200">Retrain Outcome — Candidate F1 by Decision</span>
        </div>
        <div className="p-5 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={retrain.map((r, i) => ({
                name: `RT${i + 1}`,
                candidate_f1: r.candidate_f1,
                prod_f1: r.prod_f1,
                decision: r.decision,
              }))}
              margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} domain={[0.75, 1]} tickFormatter={v => v.toFixed(2)} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="candidate_f1" name="Candidate F1" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {retrain.map((r, i) => (
                  <Cell key={i} fill={r.decision === "PROMOTED" ? "#4ade80" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="px-5 pb-4 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" />Promoted</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />Rejected</span>
        </div>
      </div>
    </div>
  );
}
