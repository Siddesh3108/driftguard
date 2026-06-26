import React, { useEffect, useState, useRef } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { Radio, Zap, Layers, Clock } from "lucide-react";
import { api, fmtDate, fmtPct } from "../api/client.js";
import MetricCard from "../components/MetricCard.jsx";

export default function StreamMonitor({ model }) {
  const [stats, setStats]     = useState([]);
  const [loading, setLoading] = useState(true);
  const intervalRef           = useRef(null);

  const load = async () => {
    setLoading(true);
    const s = await api.streamStats(model, 60);
    setStats([...s].reverse());
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Auto-refresh every 15 seconds for "live" feel
    intervalRef.current = setInterval(load, 15000);
    return () => clearInterval(intervalRef.current);
  }, [model]);

  const latest      = stats.at(-1);
  const avgEps      = stats.length ? (stats.reduce((s, d) => s + d.events_per_sec, 0) / stats.length).toFixed(2) : "—";
  const maxLag      = stats.length ? Math.max(...stats.map(d => d.consumer_lag)) : 0;
  const avgDrift    = stats.length ? (stats.reduce((s, d) => s + d.drift_share, 0) / stats.length) : 0;

  const epsData     = stats.map((d, i) => ({ i: i + 1, eps: d.events_per_sec, ts: fmtDate(d.ts) }));
  const lagData     = stats.map((d, i) => ({ i: i + 1, lag: d.consumer_lag,  ts: fmtDate(d.ts) }));
  const driftData   = stats.map((d, i) => ({ i: i + 1, drift: parseFloat((d.drift_share * 100).toFixed(2)), ts: fmtDate(d.ts) }));
  const bufferData  = stats.map((d, i) => ({ i: i + 1, buffer: d.buffer_size, window: d.window_size }));

  const TTip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="card px-3 py-2 text-xs space-y-1">
        <p className="text-slate-400">{payload[0]?.payload?.ts || label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-mono">{p.value}</span></p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-in]">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Stream Monitor</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Redis Streams consumer — rolling {latest?.window_size ?? 500}-event window drift evaluation
          </p>
        </div>
        {/* Live pulse indicator */}
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
          <div className="relative w-2.5 h-2.5">
            <span className="absolute inset-0 rounded-full bg-sky-400 animate-ping opacity-40" />
            <span className="relative block w-2.5 h-2.5 rounded-full bg-sky-400" />
          </div>
          <span>Auto-refresh 15s</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Avg Events/sec"  value={avgEps}                              sub="Rolling average" icon={Zap}    color="sky"    />
        <MetricCard label="Window Size"     value={latest?.window_size ?? "—"}          sub="Events per check" icon={Layers} color="indigo" />
        <MetricCard label="Max Consumer Lag" value={maxLag}                             sub="Unacked messages" icon={Clock}  color={maxLag > 100 ? "amber" : "green"} />
        <MetricCard label="Avg Stream Drift" value={fmtPct(avgDrift)}                  sub="Over window"      icon={Radio}  color="purple" />
      </div>

      {/* Events per second */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-200">Events/sec Throughput</span>
        </div>
        <div className="p-5 h-52">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={epsData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="epsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="i" tick={{ fontSize: 8, fill: "#64748b" }} tickLine={false} axisLine={false} label={{ value: "Window", position: "insideBottom", offset: -2, fontSize: 9, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} domain={[0, "auto"]} />
                <Tooltip content={<TTip />} />
                <Area type="monotone" dataKey="eps" stroke="#38bdf8" strokeWidth={2} fill="url(#epsGrad)" dot={false} name="Events/sec" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Consumer lag + drift side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-semibold text-slate-200">Consumer Lag (Unacked Messages)</span>
          </div>
          <div className="p-5 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lagData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="i" tick={{ fontSize: 8, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip content={<TTip />} />
                <ReferenceLine y={100} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.6} />
                <Bar dataKey="lag" fill="#818cf8" radius={[2, 2, 0, 0]} maxBarSize={12} name="Lag" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="text-sm font-semibold text-slate-200">Drift Share per Window</span>
          </div>
          <div className="p-5 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={driftData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="i" tick={{ fontSize: 8, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip content={<TTip />} />
                <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.6} />
                <Line type="monotone" dataKey="drift" stroke="#fb923c" strokeWidth={2} dot={false} name="Drift %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Buffer utilisation */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-200">Buffer vs Window Size</span>
        </div>
        <div className="p-5 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={bufferData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="bufGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="i" tick={{ fontSize: 8, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
              <Area type="monotone" dataKey="buffer" stroke="#a78bfa" strokeWidth={2} fill="url(#bufGrad)" dot={false} name="Buffer" />
              <Line type="monotone" dataKey="window" stroke="#4ade80" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="Window" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Architecture note */}
      <div className="card p-4 border-sky-500/20">
        <p className="text-xs font-semibold text-sky-400 mb-2">Architecture Note</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          The stream consumer uses <span className="font-mono text-slate-300">XREADGROUP</span> with at-least-once delivery — events are only acknowledged <em>after</em> processing, so a crash redelivers unprocessed entries.
          The stream is trimmed to <span className="font-mono text-slate-300">maxlen=100,000</span> to prevent unbounded Redis memory growth.
          Burst traffic is capped at <span className="font-mono text-slate-300">count=50</span> per loop so a spike cannot block the consumer indefinitely.
          Redis Streams is used in place of Kafka to avoid additional infrastructure; Kafka is a drop-in replacement for larger throughput requirements.
        </p>
      </div>
    </div>
  );
}
