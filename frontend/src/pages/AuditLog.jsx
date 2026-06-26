import React, { useEffect, useState, useMemo } from "react";
import { ClipboardList, Search, Filter, Download } from "lucide-react";
import { api, fmtDate } from "../api/client.js";
import { EventBadge } from "../components/StatusBadge.jsx";

const EVENT_TYPES = [
  "ALL",
  "DRIFT_CHECK",
  "DRIFT_CONFIRMED",
  "MODEL_PROMOTED",
  "RETRAIN_TRIGGERED",
  "RETRAIN_REJECTED",
  "DATA_QUALITY_ALERT",
  "COLD_START",
  "ROLLBACK",
  "STREAM_DRIFT",
];

const ROW_BG = {
  MODEL_PROMOTED:     "border-l-2 border-green-500/50",
  DRIFT_CONFIRMED:    "border-l-2 border-red-500/50",
  RETRAIN_REJECTED:   "border-l-2 border-amber-500/50",
  DATA_QUALITY_ALERT: "border-l-2 border-orange-500/50",
  ROLLBACK:           "border-l-2 border-yellow-500/50",
};

export default function AuditLog({ model }) {
  const [log,     setLog]     = useState([]);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState("ALL");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const l = await api.auditLog(model, 200);
    setLog(l);
    setLoading(false);
  };

  useEffect(() => { load(); }, [model]);

  const filtered = useMemo(() => log.filter(e => {
    const matchType   = filter === "ALL" || e.event === filter;
    const matchSearch = !search || e.message.toLowerCase().includes(search.toLowerCase()) || e.event.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  }), [log, filter, search]);

  const handleDownload = () => {
    const csv = ["timestamp,model_id,event,message",
      ...filtered.map(e => `"${e.ts}","${e.model_id}","${e.event}","${e.message.replace(/"/g,'""')}"`)
    ].join("\n");
    const blob  = new Blob([csv], { type: "text/csv" });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement("a");
    a.href      = url;
    a.download  = `driftguard_audit_${model}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = useMemo(() => {
    const c = {};
    log.forEach(e => { c[e.event] = (c[e.event] || 0) + 1; });
    return c;
  }, [log]);

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-in]">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Audit Log</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Complete record of every drift check, retrain trigger, promotion, rejection, and quality alert
          </p>
        </div>
        <button onClick={handleDownload} className="btn-ghost flex items-center gap-2 mt-1">
          <Download size={13} />
          CSV
        </button>
      </div>

      {/* Event type summary chips */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([evt, n]) => (
          <button
            key={evt}
            onClick={() => setFilter(filter === evt ? "ALL" : evt)}
            className={`flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors
                        ${filter === evt ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                                         : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500 hover:text-slate-300"}`}
          >
            <EventBadge event={evt} />
            <span className="font-mono text-slate-500 ml-0.5">×{n}</span>
          </button>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input-field pl-8"
            placeholder="Search messages…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="input-field pl-8 pr-8 w-auto appearance-none cursor-pointer"
          >
            {EVENT_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Showing count */}
      <p className="text-xs text-slate-500">
        Showing <span className="text-slate-300 font-mono">{filtered.length}</span> of{" "}
        <span className="text-slate-300 font-mono">{log.length}</span> events
      </p>

      {/* Log table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#111827] z-10">
              <tr className="border-b border-slate-700/50">
                <th className="table-header px-4 py-2.5 text-left w-40">Time</th>
                <th className="table-header px-4 py-2.5 text-left w-36">Event</th>
                <th className="table-header px-4 py-2.5 text-left">Message</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="px-4 py-12 text-center text-slate-500 text-sm">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-12 text-center text-slate-500 text-sm">No events match the current filter</td></tr>
              ) : filtered.map((e, i) => (
                <tr key={i} className={`table-row ${ROW_BG[e.event] || ""}`}>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-500 whitespace-nowrap align-top">{fmtDate(e.ts)}</td>
                  <td className="px-4 py-2.5 align-top"><EventBadge event={e.event} /></td>
                  <td className="px-4 py-2.5 text-xs text-slate-300 leading-relaxed">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
