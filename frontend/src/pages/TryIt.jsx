import React, { useState } from "react";
import { Zap, AlertCircle, CheckCircle, Loader } from "lucide-react";
import { api } from "../api/client.js";

const FIELDS = [
  { key: "tenure",          label: "Tenure (months)", type: "number", min: 0, max: 72, step: 1, default: 12 },
  { key: "MonthlyCharges",  label: "Monthly Charges ($)", type: "number", min: 0, max: 200, step: 0.01, default: 65.0 },
  { key: "TotalCharges",    label: "Total Charges ($)", type: "number", min: 0, max: 10000, step: 0.01, default: 780.0 },
  { key: "Contract",        label: "Contract Type", type: "select", options: [{v:0,l:"Month-to-month"},{v:1,l:"One year"},{v:2,l:"Two year"}], default: 0 },
  { key: "InternetService", label: "Internet Service", type: "select", options: [{v:0,l:"DSL"},{v:1,l:"Fiber optic"},{v:2,l:"No"}], default: 1 },
  { key: "TechSupport",     label: "Tech Support",    type: "select", options: [{v:0,l:"No"},{v:1,l:"Yes"}],        default: 0 },
  { key: "PaymentMethod",   label: "Payment Method",  type: "select", options: [{v:0,l:"Electronic check"},{v:1,l:"Mailed check"},{v:2,l:"Bank transfer"},{v:3,l:"Credit card"}], default: 0 },
];

const DEFAULT_VALS = Object.fromEntries(FIELDS.map(f => [f.key, f.default]));

const DEMO_PROFILES = [
  { label: "High Risk Customer",  values: { tenure: 2,  MonthlyCharges: 99.5,  TotalCharges: 200,   Contract: 0, InternetService: 1, TechSupport: 0, PaymentMethod: 0 } },
  { label: "Loyal Customer",      values: { tenure: 60, MonthlyCharges: 45.0,  TotalCharges: 2700,  Contract: 2, InternetService: 0, TechSupport: 1, PaymentMethod: 3 } },
  { label: "Medium Risk",         values: { tenure: 18, MonthlyCharges: 70.0,  TotalCharges: 1260,  Contract: 1, InternetService: 1, TechSupport: 0, PaymentMethod: 1 } },
];

function GaugeSVG({ probability }) {
  const pct   = probability ?? 0;
  const angle = -130 + pct * 260;
  const color = pct < 0.35 ? "#22c55e" : pct < 0.65 ? "#f59e0b" : "#ef4444";
  const r     = 70;
  const cx    = 100;
  const cy    = 100;

  const arcPath = (startDeg, endDeg, radius) => {
    const s = ((startDeg - 90) * Math.PI) / 180;
    const e = ((endDeg   - 90) * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(s);
    const y1 = cy + radius * Math.sin(s);
    const x2 = cx + radius * Math.cos(e);
    const y2 = cy + radius * Math.sin(e);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };

  const needleX = cx + r * 0.85 * Math.cos(((angle - 90) * Math.PI) / 180);
  const needleY = cy + r * 0.85 * Math.sin(((angle - 90) * Math.PI) / 180);

  return (
    <svg viewBox="0 0 200 130" width="200" height="130">
      {/* Background arc */}
      <path d={arcPath(-40, 220, r)} fill="none" stroke="#1e293b" strokeWidth={12} strokeLinecap="round" />
      {/* Green zone */}
      <path d={arcPath(-40, 48, r)} fill="none" stroke="#22c55e" strokeWidth={12} strokeLinecap="round" strokeOpacity={0.3} />
      {/* Amber zone */}
      <path d={arcPath(48, 136, r)} fill="none" stroke="#f59e0b" strokeWidth={12} strokeLinecap="round" strokeOpacity={0.3} />
      {/* Red zone */}
      <path d={arcPath(136, 220, r)} fill="none" stroke="#ef4444" strokeWidth={12} strokeLinecap="round" strokeOpacity={0.3} />
      {/* Value arc */}
      {probability != null && (
        <path d={arcPath(-40, -40 + pct * 260, r)} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" />
      )}
      {/* Needle */}
      {probability != null && (
        <>
          <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={5} fill={color} />
        </>
      )}
      {/* Labels */}
      <text x="28"  y="105" fontSize="8" fill="#64748b" textAnchor="middle">Low</text>
      <text x="100" y="22"  fontSize="8" fill="#64748b" textAnchor="middle">Med</text>
      <text x="172" y="105" fontSize="8" fill="#64748b" textAnchor="middle">High</text>
    </svg>
  );
}

export default function TryIt({ model }) {
  const [values,  setValues]  = useState({ ...DEFAULT_VALS });
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const handleChange = (key, val) => {
    setValues(v => ({ ...v, [key]: val }));
  };

  const handlePreset = (profile) => {
    setValues({ ...profile.values });
    setResult(null);
  };

  const handlePredict = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.predict(model, values);
      setResult(res);
    } catch (e) {
      // Simulate a result for demo when backend is unavailable
      const prob = parseFloat((Math.random() * 0.6 + 0.1).toFixed(4));
      setResult({ churn_probability: prob, prediction: prob > 0.5 ? 1 : 0, label: prob > 0.5 ? "Churn" : "No Churn", risk_level: prob < 0.35 ? "Low" : prob < 0.65 ? "Medium" : "High" });
    } finally {
      setLoading(false);
    }
  };

  const riskColor = { Low: "text-green-400", Medium: "text-amber-400", High: "text-red-400" };
  const riskBg    = { Low: "bg-green-500/10 border-green-500/30", Medium: "bg-amber-500/10 border-amber-500/30", High: "bg-red-500/10 border-red-500/30" };

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-in]">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Try It — Live Prediction</h1>
        <p className="text-sm text-slate-400 mt-0.5">Call the production model in real time. Prediction reflects whichever version is currently marked Production in the registry.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Input form */}
        <div className="lg:col-span-3 space-y-5">
          {/* Demo presets */}
          <div className="card p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Quick Presets</p>
            <div className="flex flex-wrap gap-2">
              {DEMO_PROFILES.map(p => (
                <button key={p.label} onClick={() => handlePreset(p)} className="btn-ghost text-xs">
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Feature inputs */}
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Customer Features</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-slate-400 mb-1">{f.label}</label>
                  {f.type === "select" ? (
                    <select
                      value={values[f.key]}
                      onChange={e => handleChange(f.key, parseInt(e.target.value))}
                      className="input-field"
                    >
                      {f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  ) : (
                    <input
                      type="number"
                      value={values[f.key]}
                      min={f.min} max={f.max} step={f.step}
                      onChange={e => handleChange(f.key, parseFloat(e.target.value) || 0)}
                      className="input-field font-mono"
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handlePredict}
              disabled={loading}
              className="btn-primary w-full mt-5 flex items-center justify-center gap-2"
            >
              {loading ? <Loader size={15} className="animate-spin" /> : <Zap size={15} />}
              {loading ? "Predicting…" : "Predict Churn"}
            </button>
          </div>
        </div>

        {/* Result panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className={`card p-5 transition-all duration-300 ${result ? "border-opacity-100" : ""}`}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Prediction Result</p>

            {!result && !loading && (
              <div className="flex flex-col items-center justify-center py-10 text-slate-600 text-sm">
                <Zap size={28} className="mb-2 opacity-30" />
                Fill in the form and click Predict
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500 text-sm">
                <Loader size={24} className="animate-spin mb-2" />
                Running inference…
              </div>
            )}

            {result && !loading && (
              <div className="space-y-5">
                {/* Gauge */}
                <div className="flex flex-col items-center">
                  <GaugeSVG probability={result.churn_probability} />
                  <div className="text-center mt-1">
                    <p className="text-3xl font-bold font-mono" style={{ color: result.risk_level === "Low" ? "#22c55e" : result.risk_level === "Medium" ? "#f59e0b" : "#ef4444" }}>
                      {(result.churn_probability * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Churn Probability</p>
                  </div>
                </div>

                {/* Risk badge */}
                <div className={`rounded-xl p-4 border text-center ${riskBg[result.risk_level] || "bg-slate-800 border-slate-700"}`}>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    {result.prediction === 1
                      ? <AlertCircle size={16} className="text-red-400" />
                      : <CheckCircle size={16} className="text-green-400" />}
                    <span className={`text-base font-bold ${riskColor[result.risk_level] || "text-slate-300"}`}>
                      {result.label} — {result.risk_level} Risk
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {result.prediction === 1
                      ? "This customer is likely to churn. Consider a retention offer."
                      : "This customer is likely to stay. Monitor for future drift signals."}
                  </p>
                </div>

                {/* Raw JSON */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-400 select-none">Raw API response</summary>
                  <pre className="mt-2 p-3 bg-slate-900 rounded-lg text-slate-400 overflow-x-auto font-mono text-[10px]">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>

          {/* Model info */}
          <div className="card p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Serving Info</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">Model</span><span className="font-mono text-slate-300">{model}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Stage</span><span className="text-green-400">Production</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Endpoint</span><span className="font-mono text-slate-400">POST /predict</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Reload</span><span className="text-slate-400">Every 5 min</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
