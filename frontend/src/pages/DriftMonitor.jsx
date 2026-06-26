import React, { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid, Cell, Legend,
} from "recharts";
import { Activity, AlertTriangle } from "lucide-react";
import { api, fmtDate, fmtPct, driftBgColor } from "../api/client.js";
import MetricCard from "../components/MetricCard.jsx";
import { StatusDot } from "../components/StatusBadge.jsx";

const TTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs space-y-1">
      <p className="text-slate-400 font-mono">{fmtDate(d.ts)}</p>
      <p><span className="text-slate-400">Drift:</span> <span className="text-indigo-300 font-mono">{fmtPct(d.drift_share)}</span></p>
      <p><span className="text-slate-400">Status:</span> <span className={d.status === "drifting" ? "text-red-400" : "text-green-400"}>{d.status}</span></p>
      {d.drifted_features && <p className="text-slate-500 max-w-[180px] break-words">{d.drifted_features}</p>}
    </div>
  );
};

export default function DriftMonitor({ model }) {
  const [history, setHistory] = useState([]);
  const [threshold, setThreshold] = useState(0.30);
  const [loading, setLoading]  = useState(true);

  const load = async () => {
    setLoading(true);
    const [h, cfg] = await Promise.all([api.driftHistory(model, 50), api.config()]);
    setHistory([...h].reverse());
    setThreshold(cfg?.[model]?.drift_threshold ?? 0.30);
    setLoading(false);
  };

  useEffect(() => { load(); }, [model]);

  const drifting = history.filter(d => d.status === "drifting").length;
  const stable   = history.filter(d => d.status === "ok").length;
  const maxDrift = history.length ? Math.max(...history.map(d => d.drift_share)) : 0;
  const avgDrift = history.length ? history.reduce((a, b) => a + b.drift_share, 0) / history.length : 0;

  // Per-feature drift breakdown from the most recent drifting batch
  const lastDrifting = [...history].reverse().find(d => d.drifted_features);
  const featureData  = lastDrifting?.drifted_features
    ? lastDrifting.drifted_features.split(";").map(s => {
        const [feat, score] = s.trim().split(":");
        return { feature: feat?.trim(), score: parseFloat(score?.trim()) || 0 };
      }).filter(f => f.feature)
    : [];

  const chartData = history.map((d, i) => ({
    ...d,
    idx: i + 1,
    label: `B${i + 1}`,
  }));

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-in]">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Drift Monitor</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Threshold: <span className="font-mono text-amber-400">{(threshold * 100).toFixed(0)}%</span>
          {" — "}debounced streak trigger (consecutive detections before retraining)
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Batches Checked" value={history.length}       sub="Total evaluated"   icon={Activity} color="indigo" />
        <MetricCard label="Drifting Batches" value={drifting}            sub={`${stable} stable`} icon={AlertTriangle} color={drifting > 0 ? "red" : "green"} />
        <MetricCard label="Max Drift Share"  value={fmtPct(maxDrift)}    sub="Peak detected"     icon={Activity} color={maxDrift > threshold ? "red" : "green"} />
        <MetricCard label="Avg Drift Share"  value={fmtPct(avgDrift)}    sub="Rolling average"   icon={Activity} color="purple" />
      </div>

      {/* Main drift timeline */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-200">Drift Share Over Time</span>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-6 border-t-2 border-dashed border-red-400/70 inline-block" /> Threshold</span>
            <span className="flex items-center gap-1"><span className="w-6 border-t-2 border-indigo-400 inline-block" /> Drift Share</span>
          </div>
        </div>
        <div className="p-5 h-64">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={v => `${(v*100).toFixed(0)}%`} domain={[0,"auto"]} />
                <Tooltip content={<TTip />} />
                <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="5 5" strokeOpacity={0.8} />
                <Line
                  type="monotone" dataKey="drift_share" stroke="#6366f1" strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    const color = payload.status === "drifting" ? "#ef4444" : "#22c55e";
                    return <circle key={`dot-${props.index}`} cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Feature-level drift + Batch distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Feature drift (last drifting batch) */}
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-semibold text-slate-200">
              Feature Drift Scores {lastDrifting ? `— ${lastDrifting.batch_id}` : ""}
            </span>
          </div>
          <div className="p-5 h-52">
            {featureData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                No drifted features detected
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={featureData} layout="vertical" margin={{ left: 10, right: 20, top: 4, bottom: 4 }}>
                  <XAxis type="number" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} domain={[0, 1]} tickFormatter={v => v.toFixed(1)} />
                  <YAxis type="category" dataKey="feature" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={110} />
                  <Tooltip formatter={(v) => v.toFixed(3)} contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                    {featureData.map((f, i) => (
                      <Cell key={i} fill={driftBgColor(f.score, 0.5)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Drift status distribution */}
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-semibold text-slate-200">Batch Status Distribution</span>
          </div>
          <div className="p-5 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[{ name: "Stable", value: stable, fill: "#22c55e" }, { name: "Drifting", value: drifting, fill: "#ef4444" }]}
                margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
              >
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {[{ fill: "#22c55e" }, { fill: "#ef4444" }].map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Batch log table */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-200">Batch-by-Batch Log</span>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#111827] z-10">
              <tr className="border-b border-slate-700/50">
                {["Time", "Batch ID", "Drift Share", "Status", "Streak", "Top Features"].map(h => (
                  <th key={h} className="table-header px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((d, i) => (
                <tr key={i} className="table-row">
                  <td className="px-4 py-2 text-xs font-mono text-slate-400 whitespace-nowrap">{fmtDate(d.ts)}</td>
                  <td className="px-4 py-2 text-xs font-mono text-slate-300">{d.batch_id}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-800 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full"
                          style={{ width: `${Math.min(d.drift_share * 100 / (threshold * 100) * 100, 100)}%`, background: driftBgColor(d.drift_share, threshold) }}
                        />
                      </div>
                      <span className="text-xs font-mono" style={{ color: driftBgColor(d.drift_share, threshold) }}>
                        {fmtPct(d.drift_share)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <StatusDot status={d.status} size={6} />
                      <span className={`text-xs ${d.status === "drifting" ? "text-red-400" : "text-green-400"}`}>{d.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-slate-400">{d.streak ?? 0}</td>
                  <td className="px-4 py-2 text-xs text-slate-500 max-w-xs truncate">{d.drifted_features || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
