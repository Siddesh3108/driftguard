/**
 * DriftGuard — API client.
 * All fetches include a mock fallback so the dashboard renders
 * even without a running backend (e.g. portfolio screenshot mode).
 */

const BASE = import.meta.env.VITE_API_URL || "";

async function fetchJSON(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ─── Mock data (used when backend is unavailable) ──────────────────────────

const now = new Date();
const daysAgo = (n, h = 0) =>
  new Date(now - n * 86400000 - h * 3600000).toISOString();

export const MOCK = {
  models: [
    { id: "churn_model",  display_name: "Customer Churn",    drift_threshold: 0.30, consecutive_triggers: 2 },
    { id: "fraud_model",  display_name: "Fraud Detection",   drift_threshold: 0.20, consecutive_triggers: 1 },
  ],

  systemStatus: {
    models: {
      churn_model: { model_loaded: true,  prod_version: "v5", last_drift_share: 0.103, last_drift_status: "ok",      last_check_ts: daysAgo(1) },
      fraud_model: { model_loaded: true,  prod_version: "v2", last_drift_share: 0.142, last_drift_status: "ok",      last_check_ts: daysAgo(0, 3) },
    },
    services: { mlflow: "up", api: "up" },
  },

  driftHistory: Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    ts: daysAgo(30 - i, Math.floor(Math.random() * 24)),
    model_id: "churn_model",
    batch_id: `batch_${String(i + 1).padStart(3, "0")}`,
    drift_share: i < 18
      ? parseFloat((0.05 + Math.random() * 0.08).toFixed(3))
      : parseFloat((0.22 + (i - 18) * 0.025 + Math.random() * 0.04).toFixed(3)),
    drifted_features: i >= 18 ? "MonthlyCharges: 0.72; tenure: 0.45; Contract: 0.38" : "",
    status: i >= 18 && (0.22 + (i - 18) * 0.025) > 0.30 ? "drifting" : "ok",
    streak: Math.max(0, i - 21),
  })),

  retrainHistory: [
    { id: 1, ts: daysAgo(22), model_id: "churn_model", trigger_reason: "drift_confirmed", candidate_f1: 0.823, prod_f1: 0.801, decision: "PROMOTED", new_version: "v2", duration_secs: 142.3 },
    { id: 2, ts: daysAgo(18), model_id: "churn_model", trigger_reason: "drift_confirmed", candidate_f1: 0.834, prod_f1: 0.823, decision: "PROMOTED", new_version: "v3", duration_secs: 138.7 },
    { id: 3, ts: daysAgo(10), model_id: "churn_model", trigger_reason: "drift_confirmed", candidate_f1: 0.815, prod_f1: 0.834, decision: "REJECTED",  new_version: "v4", duration_secs: 145.1 },
    { id: 4, ts: daysAgo(5),  model_id: "churn_model", trigger_reason: "drift_confirmed", candidate_f1: 0.847, prod_f1: 0.834, decision: "PROMOTED", new_version: "v5", duration_secs: 151.4 },
    { id: 5, ts: daysAgo(8),  model_id: "fraud_model", trigger_reason: "drift_confirmed", candidate_f1: 0.912, prod_f1: 0.904, decision: "PROMOTED", new_version: "v2", duration_secs: 98.2 },
  ],

  modelVersions: [
    { version: "v5", version_num: 5, status: "Production", f1_score: 0.847, accuracy: 0.821, roc_auc: 0.893, decision: "PROMOTED", created_at: daysAgo(5) },
    { version: "v4", version_num: 4, status: "Archived",   f1_score: 0.815, accuracy: 0.799, roc_auc: 0.871, decision: "REJECTED",  created_at: daysAgo(10) },
    { version: "v3", version_num: 3, status: "Archived",   f1_score: 0.834, accuracy: 0.812, roc_auc: 0.884, decision: "PROMOTED", created_at: daysAgo(18) },
    { version: "v2", version_num: 2, status: "Archived",   f1_score: 0.823, accuracy: 0.806, roc_auc: 0.879, decision: "PROMOTED", created_at: daysAgo(22) },
    { version: "v1", version_num: 1, status: "Archived",   f1_score: 0.801, accuracy: 0.789, roc_auc: 0.862, decision: null,       created_at: daysAgo(30) },
  ],

  performanceHistory: [
    { start_time: daysAgo(30), "metrics.f1_score": 0.801, "metrics.accuracy": 0.789, "metrics.roc_auc": 0.862, "tags.decision": null,        "tags.mlflow.runName": "baseline_model" },
    { start_time: daysAgo(22), "metrics.f1_score": 0.823, "metrics.accuracy": 0.806, "metrics.roc_auc": 0.879, "tags.decision": "PROMOTED",  "tags.mlflow.runName": "auto_retrain_candidate" },
    { start_time: daysAgo(18), "metrics.f1_score": 0.834, "metrics.accuracy": 0.812, "metrics.roc_auc": 0.884, "tags.decision": "PROMOTED",  "tags.mlflow.runName": "auto_retrain_candidate" },
    { start_time: daysAgo(10), "metrics.f1_score": 0.815, "metrics.accuracy": 0.799, "metrics.roc_auc": 0.871, "tags.decision": "REJECTED",  "tags.mlflow.runName": "auto_retrain_candidate" },
    { start_time: daysAgo(5),  "metrics.f1_score": 0.847, "metrics.accuracy": 0.821, "metrics.roc_auc": 0.893, "tags.decision": "PROMOTED",  "tags.mlflow.runName": "auto_retrain_candidate" },
  ],

  auditLog: [
    { ts: daysAgo(0, 2),  model_id: "churn_model", event: "DRIFT_CHECK",       message: "drift_share=0.103 (threshold=0.30) streak=0/2" },
    { ts: daysAgo(1),     model_id: "churn_model", event: "DRIFT_CHECK",       message: "drift_share=0.091 (threshold=0.30) streak=0/2" },
    { ts: daysAgo(5),     model_id: "churn_model", event: "MODEL_PROMOTED",    message: "v5 promoted | candidate F1=0.847 vs prod F1=0.834 | duration=151.4s" },
    { ts: daysAgo(5, 3),  model_id: "churn_model", event: "DRIFT_CONFIRMED",   message: "Broad distribution shift across 4 features. New regional rollout detected." },
    { ts: daysAgo(8),     model_id: "fraud_model", event: "MODEL_PROMOTED",    message: "v2 promoted | candidate F1=0.912 vs prod F1=0.904 | duration=98.2s" },
    { ts: daysAgo(10),    model_id: "churn_model", event: "RETRAIN_REJECTED",  message: "v4 rejected | candidate F1=0.815 < prod F1=0.834 | prod model keeps serving" },
    { ts: daysAgo(12),    model_id: "churn_model", event: "DATA_QUALITY_ALERT",message: "18.3% of batch_020 rows failed schema validation. Treating as upstream data issue." },
    { ts: daysAgo(18),    model_id: "churn_model", event: "MODEL_PROMOTED",    message: "v3 promoted | candidate F1=0.834 vs prod F1=0.823 | duration=138.7s" },
    { ts: daysAgo(22),    model_id: "churn_model", event: "MODEL_PROMOTED",    message: "v2 promoted | candidate F1=0.823 vs prod F1=0.801 | duration=142.3s" },
    { ts: daysAgo(30),    model_id: "churn_model", event: "COLD_START",        message: "Pipeline initialized. Baseline model v1 loaded." },
  ],

  dataQuality: Array.from({ length: 30 }, (_, i) => {
    const total = 900 + Math.floor(Math.random() * 200);
    const rate = i === 12 ? 0.183 : parseFloat((0.01 + Math.random() * 0.04).toFixed(3));
    const quarantined = Math.floor(total * rate);
    return { id: i + 1, ts: daysAgo(30 - i), model_id: "churn_model", batch_id: `batch_${String(i + 1).padStart(3, "0")}`, total_rows: total, clean_rows: total - quarantined, quarantined_rows: quarantined, rejection_rate: rate, status: rate > 0.15 ? "quarantined" : "ok" };
  }),

  streamStats: Array.from({ length: 48 }, (_, i) => ({
    id: i + 1, ts: daysAgo(2, i % 24), model_id: "churn_model",
    events_per_sec: parseFloat((4.2 + Math.random() * 1.6).toFixed(2)),
    window_size: 500, buffer_size: 480 + Math.floor(Math.random() * 40),
    consumer_lag: Math.floor(Math.random() * 30),
    drift_share: parseFloat((0.05 + Math.random() * 0.13).toFixed(3)),
  })),

  featureImportance: [
    { feature: "tenure",          importance: 0.2341 },
    { feature: "MonthlyCharges",  importance: 0.1987 },
    { feature: "TotalCharges",    importance: 0.1654 },
    { feature: "Contract",        importance: 0.1423 },
    { feature: "InternetService", importance: 0.0982 },
    { feature: "TechSupport",     importance: 0.0743 },
    { feature: "PaymentMethod",   importance: 0.0612 },
  ],

  config: {
    churn_model: { display_name: "Customer Churn", drift_threshold: 0.30, consecutive_triggers: 2, max_rejection_rate: 0.15, features: ["tenure","MonthlyCharges","TotalCharges","Contract","InternetService","TechSupport","PaymentMethod"] },
    fraud_model:  { display_name: "Fraud Detection", drift_threshold: 0.20, consecutive_triggers: 1, max_rejection_rate: 0.10, features: ["amount","merchant_category","hour_of_day","day_of_week","distance_from_home"] },
  },
};

// ─── API functions ──────────────────────────────────────────────────────────

async function safeFetch(path, mock, opts = {}) {
  try {
    return await fetchJSON(path, opts);
  } catch {
    return mock;
  }
}

export const api = {
  models:            ()           => safeFetch("/api/models",                    MOCK.models),
  systemStatus:      ()           => safeFetch("/api/system-status",             MOCK.systemStatus),
  driftHistory:      (mid, n=50)  => safeFetch(`/api/drift-history?model_id=${mid}&limit=${n}`, MOCK.driftHistory.filter(d => d.model_id === mid)),
  retrainHistory:    (mid, n=50)  => safeFetch(`/api/retrain-history?model_id=${mid}&limit=${n}`, MOCK.retrainHistory.filter(r => r.model_id === mid)),
  modelVersions:     (mid)        => safeFetch(`/api/model-versions?model_id=${mid}`,            MOCK.modelVersions),
  performanceHistory:(mid)        => safeFetch(`/api/performance-history?model_id=${mid}`,       MOCK.performanceHistory),
  auditLog:          (mid, n=100) => safeFetch(`/api/audit-log?model_id=${mid}&limit=${n}`,      MOCK.auditLog.filter(e => e.model_id === mid)),
  dataQuality:       (mid, n=50)  => safeFetch(`/api/data-quality?model_id=${mid}&limit=${n}`,   MOCK.dataQuality.filter(d => d.model_id === mid)),
  streamStats:       (mid, n=50)  => safeFetch(`/api/stream-stats?model_id=${mid}&limit=${n}`,   MOCK.streamStats.filter(s => s.model_id === mid)),
  featureImportance: (mid)        => safeFetch(`/api/feature-importance?model_id=${mid}`,        MOCK.featureImportance),
  config:            ()           => safeFetch("/api/config",                    MOCK.config),

  predict: (modelId, features)  => fetchJSON("/predict", {
    method: "POST",
    body: JSON.stringify({ model_id: modelId, features }),
  }),

  rollback: (modelId, version) => fetchJSON(`/api/rollback/${modelId}/${version}`, { method: "POST" }),

  injectBatch: (modelId, batchName) =>
    fetchJSON(`/api/inject-batch?model_id=${modelId}&batch_name=${batchName}`, { method: "POST" }),
};

// ─── Utility ────────────────────────────────────────────────────────────────

export function fmtDate(isoStr) {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtPct(v) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function driftColor(share, threshold = 0.3) {
  if (share == null) return "text-slate-400";
  if (share > threshold) return "text-red-400";
  if (share > threshold * 0.75) return "text-amber-400";
  return "text-green-400";
}

export function driftBgColor(share, threshold = 0.3) {
  if (share == null) return "#64748b";
  if (share > threshold) return "#ef4444";
  if (share > threshold * 0.75) return "#f59e0b";
  return "#22c55e";
}
