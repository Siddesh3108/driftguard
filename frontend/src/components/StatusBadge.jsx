import React from "react";
import { CheckCircle, AlertTriangle, XCircle, Info, RefreshCw, Zap, Shield, Database, Radio } from "lucide-react";

const EVENT_MAP = {
  MODEL_PROMOTED:     { cls: "badge-ok",    Icon: CheckCircle,    label: "Promoted" },
  RETRAIN_TRIGGERED:  { cls: "badge-info",  Icon: RefreshCw,      label: "Retrain" },
  RETRAIN_REJECTED:   { cls: "badge-warn",  Icon: Shield,         label: "Rejected" },
  DATA_QUALITY_ALERT: { cls: "badge-alert", Icon: Database,       label: "Data Quality" },
  DRIFT_CONFIRMED:    { cls: "badge-alert", Icon: Zap,            label: "Drift!" },
  DRIFT_CHECK:        { cls: "badge-muted", Icon: Radio,          label: "Check" },
  COLD_START:         { cls: "badge-info",  Icon: Info,           label: "Cold Start" },
  ROLLBACK:           { cls: "badge-warn",  Icon: AlertTriangle,  label: "Rollback" },
  STREAM_DRIFT:       { cls: "badge-alert", Icon: Zap,            label: "Stream Drift" },
  MODEL_LOADED:       { cls: "badge-ok",    Icon: CheckCircle,    label: "Loaded" },
};

export function EventBadge({ event }) {
  const cfg = EVENT_MAP[event] || { cls: "badge-muted", Icon: Info, label: event };
  const { cls, Icon, label } = cfg;
  return (
    <span className={cls}>
      <Icon size={10} />
      {label}
    </span>
  );
}

export function StatusDot({ status, size = 8 }) {
  const map = {
    ok:          "bg-green-400",
    drifting:    "bg-red-400 animate-pulse",
    quarantined: "bg-amber-400",
    up:          "bg-green-400",
    down:        "bg-red-400",
    degraded:    "bg-amber-400",
    unknown:     "bg-slate-500",
    Production:  "bg-green-400",
    Archived:    "bg-slate-500",
    Staging:     "bg-amber-400",
    PROMOTED:    "bg-green-400",
    REJECTED:    "bg-red-400",
  };
  const cls = map[status] || "bg-slate-500";
  return (
    <span
      className={`inline-block rounded-full flex-shrink-0 ${cls}`}
      style={{ width: size, height: size }}
    />
  );
}

export function DecisionBadge({ decision }) {
  if (!decision) return null;
  const map = {
    PROMOTED: "badge-ok",
    REJECTED: "badge-alert",
  };
  return <span className={map[decision] || "badge-muted"}>{decision}</span>;
}
