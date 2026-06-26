import React from "react";
import { CheckCircle, Clock, AlertCircle, ArrowRight } from "lucide-react";

const STAGES = [
  { key: "ingest",    label: "Ingest" },
  { key: "validate",  label: "Validate" },
  { key: "detect",    label: "Detect Drift" },
  { key: "debounce",  label: "Debounce" },
  { key: "retrain",   label: "Retrain" },
  { key: "gate",      label: "Champion Gate" },
  { key: "serve",     label: "Serve" },
];

function StageIcon({ status }) {
  if (status === "ok")      return <CheckCircle size={14} className="text-green-400" />;
  if (status === "active")  return <Clock size={14} className="text-amber-400 animate-pulse" />;
  if (status === "alert")   return <AlertCircle size={14} className="text-red-400" />;
  return <span className="w-3.5 h-3.5 rounded-full bg-slate-700 inline-block" />;
}

export default function PipelineStatus({ driftStatus, retraining = false }) {
  // Derive stage statuses from overall pipeline state
  const isDrifting = driftStatus === "drifting";

  const stageMap = {
    ingest:   "ok",
    validate: "ok",
    detect:   isDrifting ? "alert" : "ok",
    debounce: isDrifting ? "active" : "ok",
    retrain:  retraining ? "active" : (isDrifting ? "active" : "idle"),
    gate:     retraining ? "active" : "idle",
    serve:    "ok",
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STAGES.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium
                          ${stageMap[s.key] === "ok"     ? "bg-green-500/10 text-green-400 border border-green-500/20" :
                            stageMap[s.key] === "alert"  ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                            stageMap[s.key] === "active" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                                                           "bg-slate-800 text-slate-500 border border-slate-700/50"}`}>
            <StageIcon status={stageMap[s.key]} />
            {s.label}
          </div>
          {i < STAGES.length - 1 && (
            <ArrowRight size={12} className="text-slate-700 flex-shrink-0" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
