import React, { useEffect, useState } from "react";
import { Settings as SettingsIcon, Play, CheckCircle, AlertCircle, Zap } from "lucide-react";
import { api } from "../api/client.js";

const BATCHES = [
  { name: "batch_3_contract_shift", label: "Contract Shift", desc: "Oversampled month-to-month contracts — simulates pricing change" },
  { name: "batch_4_price_shift",    label: "Price Hike",     desc: "MonthlyCharges +15-20% — simulates a price increase" },
  { name: "batch_5_corrupted",      label: "Corrupt Data",   desc: "5% bad rows — triggers DATA_QUALITY_ALERT, not drift" },
  { name: "batch_8_region_shift",   label: "Region Rollout", desc: "Population shift — simulates new geographic expansion" },
];

export default function Settings({ model }) {
  const [config,    setConfig]    = useState(null);
  const [injecting, setInjecting] = useState(null);
  const [toast,     setToast]     = useState(null);

  const load = async () => {
    const c = await api.config();
    setConfig(c);
  };

  useEffect(() => { load(); }, [model]);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const handleInject = async (batchName) => {
    setInjecting(batchName);
    try {
      await api.injectBatch(model, batchName);
      showToast(`Batch "${batchName}" injected — drift check queued`, true);
    } catch {
      showToast(`Injection failed — backend may not be running`, false);
    } finally {
      setInjecting(null);
    }
  };

  const cfg = config?.[model];

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-in]">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border
                        ${toast.ok ? "bg-green-500/10 border-green-500/30 text-green-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
          {toast.msg}
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Pipeline configuration, demo controls, and system information</p>
      </div>

      {/* Model configuration */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-200">Model Configuration — {model}</span>
        </div>
        <div className="p-5">
          {!cfg ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Drift Detection</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-slate-700/40">
                    <span className="text-xs text-slate-400">Drift Threshold</span>
                    <span className="font-mono text-sm text-amber-400">{(cfg.drift_threshold * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-700/40">
                    <span className="text-xs text-slate-400">Consecutive Triggers</span>
                    <span className="font-mono text-sm text-indigo-400">{cfg.consecutive_triggers}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-xs text-slate-400">Max Rejection Rate</span>
                    <span className="font-mono text-sm text-red-400">{(cfg.max_rejection_rate * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Features Monitored</p>
                <div className="flex flex-wrap gap-1.5">
                  {(cfg.features || []).map(f => (
                    <span key={f} className="badge-info text-[10px] font-mono">{f}</span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">System</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-slate-700/40">
                    <span className="text-xs text-slate-400">Retrain Lock TTL</span>
                    <span className="font-mono text-sm text-slate-300">1h</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-700/40">
                    <span className="text-xs text-slate-400">Model Reload</span>
                    <span className="font-mono text-sm text-slate-300">Every 5 min</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-xs text-slate-400">Scheduler</span>
                    <span className="font-mono text-sm text-slate-300">Celery Beat</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <p className="text-[10px] text-slate-600 mt-5">
            To change thresholds, edit <span className="font-mono">config/models.yaml</span> and restart the worker.
          </p>
        </div>
      </div>

      {/* Demo batch injection */}
      <div className="card">
        <div className="card-header flex items-center gap-2">
          <Zap size={14} className="text-amber-400" />
          <span className="text-sm font-semibold text-slate-200">Demo — Inject Drift Batch</span>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Inject a pre-built drift scenario into the pipeline. Each batch triggers a{" "}
            <span className="font-mono text-slate-300">check_drift</span> Celery task — watch the
            Drift Monitor and Audit Log pages update. This is how you demo DriftGuard live in interviews
            without waiting for real drift to occur.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BATCHES.map(b => (
              <div key={b.name} className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{b.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{b.desc}</p>
                </div>
                <button
                  onClick={() => handleInject(b.name)}
                  disabled={injecting === b.name}
                  className="btn-primary flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5"
                >
                  <Play size={11} className={injecting === b.name ? "animate-pulse" : ""} />
                  {injecting === b.name ? "…" : "Inject"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tech stack */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-200">Tech Stack</span>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              ["Model Training",     "scikit-learn"],
              ["Experiment Tracking","MLflow"],
              ["Drift Detection",    "Evidently AI"],
              ["Task Orchestration", "Celery + Redis"],
              ["Real-Time Streaming","Redis Streams"],
              ["LLM Explanations",   "Ollama (local)"],
              ["Alerting",           "Slack Webhooks"],
              ["API",                "FastAPI"],
              ["Frontend",           "React + Recharts"],
              ["CI/CD",              "GitHub Actions"],
              ["Containers",         "Docker Compose"],
              ["Dataset",            "IBM Telco Churn"],
            ].map(([layer, tool]) => (
              <div key={layer} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/40">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{layer}</p>
                <p className="text-xs text-slate-200 font-medium mt-0.5">{tool}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Slack + environment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="card p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Slack Alerts</p>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={14} className="text-amber-400" />
            <span className="text-xs text-slate-400">Set <span className="font-mono text-slate-300">SLACK_WEBHOOK_URL</span> env var to enable</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            A cooldown of 5 minutes per event type prevents channel spam on burst alerts.
            A Slack outage never breaks the pipeline — the SQLite audit log is always written first.
          </p>
        </div>

        <div className="card p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Quick Start</p>
          <pre className="text-[10px] font-mono text-slate-400 leading-relaxed bg-slate-900 rounded-lg p-3 overflow-x-auto">
{`# 1. Train baseline + seed demo data
python src/train_baseline.py
python data/seed_demo_data.py

# 2. Start everything
docker compose up --build

# 3. Open the dashboard
http://localhost`}
          </pre>
        </div>
      </div>
    </div>
  );
}
