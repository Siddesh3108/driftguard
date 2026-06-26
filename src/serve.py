"""
DriftGuard — FastAPI serving layer.
Serves predictions from the Production model in the MLflow registry.
Exposes all API endpoints consumed by the React dashboard.
A newly promoted model goes live without restarting — the background
thread reloads from the registry every 5 minutes.
"""
import os
import sys
import time
import threading
import datetime
import sqlite3
import yaml
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import init_db, get_conn

# MLflow is imported at module level; the serving container requires it.
import mlflow
import mlflow.sklearn
from mlflow.tracking import MlflowClient

MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://mlflow:5000")
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")

mlflow.set_tracking_uri(MLFLOW_URI)

with open("config/models.yaml") as f:
    MODEL_CONFIGS = yaml.safe_load(f)["models"]

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="DriftGuard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://localhost:3000"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Per-model loaded models (thread-safe)
# ---------------------------------------------------------------------------
_models: Dict[str, Any] = {}
_model_lock = threading.Lock()


def _load_model(model_id: str) -> Optional[Any]:
    try:
        return mlflow.sklearn.load_model(f"models:/{model_id}/Production")
    except Exception:
        return None


def _reload_all_models() -> None:
    global _models
    for mid in MODEL_CONFIGS:
        m = _load_model(mid)
        if m is not None:
            with _model_lock:
                _models[mid] = m


def _reload_loop() -> None:
    while True:
        time.sleep(300)
        _reload_all_models()


@app.on_event("startup")
def startup():
    init_db()
    _reload_all_models()
    threading.Thread(target=_reload_loop, daemon=True).start()


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------
class PredictRequest(BaseModel):
    model_id: str = "churn_model"
    features: Dict[str, Any]


@app.post("/predict")
def predict(req: PredictRequest):
    with _model_lock:
        model = _models.get(req.model_id)
    if model is None:
        raise HTTPException(503, f"Model '{req.model_id}' not loaded (Production version missing).")

    df = pd.DataFrame([req.features])
    try:
        pred = int(model.predict(df)[0])
        proba = float(model.predict_proba(df)[0][1])
    except Exception as e:
        raise HTTPException(400, f"Prediction failed: {e}")

    label_map = {0: "No Churn", 1: "Churn"}
    risk = "Low" if proba < 0.35 else ("Medium" if proba < 0.65 else "High")
    return {
        "model_id": req.model_id,
        "prediction": pred,
        "label": label_map.get(pred, str(pred)),
        "churn_probability": round(proba, 4),
        "risk_level": risk,
    }


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    loaded = {mid: (mid in _models) for mid in MODEL_CONFIGS}
    return {"status": "ok", "models_loaded": loaded}


# ---------------------------------------------------------------------------
# API — Audit Log
# ---------------------------------------------------------------------------
@app.get("/api/audit-log")
def audit_log(
    model_id: Optional[str] = None,
    event: Optional[str] = None,
    limit: int = Query(100, le=500),
):
    conn = get_conn()
    query = "SELECT ts, model_id, event, message FROM events WHERE 1=1"
    params: list = []
    if model_id:
        query += " AND model_id = ?"
        params.append(model_id)
    if event:
        query += " AND event = ?"
        params.append(event)
    query += " ORDER BY ts DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# API — Drift History
# ---------------------------------------------------------------------------
@app.get("/api/drift-history")
def drift_history(
    model_id: Optional[str] = None,
    limit: int = Query(50, le=200),
):
    conn = get_conn()
    query = "SELECT * FROM drift_history WHERE 1=1"
    params: list = []
    if model_id:
        query += " AND model_id = ?"
        params.append(model_id)
    query += " ORDER BY ts DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# API — Performance History (MLflow runs)
# ---------------------------------------------------------------------------
@app.get("/api/performance-history")
def performance_history(model_id: str = "churn_model"):
    try:
        experiment_name = f"driftguard-{model_id}"
        runs = mlflow.search_runs(experiment_names=[experiment_name])
        if runs.empty:
            return []
        cols = []
        for c in ["run_id", "start_time", "metrics.f1_score", "metrics.candidate_f1",
                   "metrics.current_prod_f1", "metrics.accuracy", "metrics.roc_auc",
                   "tags.decision", "tags.mlflow.runName"]:
            if c in runs.columns:
                cols.append(c)
        runs_filtered = runs[cols].copy()
        runs_filtered["start_time"] = runs_filtered["start_time"].astype(str)
        return runs_filtered.to_dict(orient="records")
    except Exception as exc:
        return []


# ---------------------------------------------------------------------------
# API — Model Versions
# ---------------------------------------------------------------------------
@app.get("/api/model-versions")
def model_versions(model_id: str = "churn_model"):
    try:
        client = MlflowClient()
        versions = client.search_model_versions(f"name='{model_id}'")
        result = []
        for v in sorted(versions, key=lambda x: int(x.version), reverse=True):
            run_metrics = {}
            try:
                run = mlflow.get_run(v.run_id)
                run_metrics = {
                    "f1_score": run.data.metrics.get("f1_score") or
                                run.data.metrics.get("candidate_f1"),
                    "accuracy": run.data.metrics.get("accuracy"),
                    "roc_auc": run.data.metrics.get("roc_auc"),
                    "decision": run.data.tags.get("decision"),
                }
            except Exception:
                pass
            result.append({
                "version": f"v{v.version}",
                "version_num": int(v.version),
                "status": v.current_stage,
                "run_id": v.run_id,
                "created_at": str(v.creation_timestamp),
                **run_metrics,
            })
        return result
    except Exception:
        return []


# ---------------------------------------------------------------------------
# API — Model Rollback
# ---------------------------------------------------------------------------
@app.post("/api/rollback/{model_id}/{version}")
def rollback(model_id: str, version: str):
    try:
        client = MlflowClient()
        ver_num = version.lstrip("v")
        client.transition_model_version_stage(
            name=model_id, version=ver_num, stage="Production",
            archive_existing_versions=True,
        )
        _reload_all_models()

        from db import log_event
        log_event(model_id, "ROLLBACK", f"Rolled back to v{ver_num} via dashboard action.")
        return {"status": "ok", "rolled_back_to": f"v{ver_num}"}
    except Exception as e:
        raise HTTPException(500, str(e))


# ---------------------------------------------------------------------------
# API — Retrain History
# ---------------------------------------------------------------------------
@app.get("/api/retrain-history")
def retrain_history(
    model_id: Optional[str] = None,
    limit: int = Query(50, le=200),
):
    conn = get_conn()
    query = "SELECT * FROM retrain_history WHERE 1=1"
    params: list = []
    if model_id:
        query += " AND model_id = ?"
        params.append(model_id)
    query += " ORDER BY ts DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# API — Data Quality
# ---------------------------------------------------------------------------
@app.get("/api/data-quality")
def data_quality(
    model_id: Optional[str] = None,
    limit: int = Query(50, le=200),
):
    conn = get_conn()
    query = "SELECT * FROM data_quality WHERE 1=1"
    params: list = []
    if model_id:
        query += " AND model_id = ?"
        params.append(model_id)
    query += " ORDER BY ts DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# API — Stream Stats
# ---------------------------------------------------------------------------
@app.get("/api/stream-stats")
def stream_stats(
    model_id: Optional[str] = None,
    limit: int = Query(50, le=200),
):
    conn = get_conn()
    query = "SELECT * FROM stream_stats WHERE 1=1"
    params: list = []
    if model_id:
        query += " AND model_id = ?"
        params.append(model_id)
    query += " ORDER BY ts DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# API — System Status (pipeline health overview)
# ---------------------------------------------------------------------------
@app.get("/api/system-status")
def system_status():
    status: dict = {"models": {}, "services": {}}

    for mid in MODEL_CONFIGS:
        with _model_lock:
            loaded = mid in _models
        try:
            client = MlflowClient()
            versions = client.search_model_versions(f"name='{mid}'")
            prod_versions = [v for v in versions if v.current_stage == "Production"]
            prod_version = f"v{prod_versions[0].version}" if prod_versions else None
        except Exception:
            prod_version = None

        conn = get_conn()
        last_drift = conn.execute(
            "SELECT drift_share, status, ts FROM drift_history WHERE model_id=? ORDER BY ts DESC LIMIT 1",
            (mid,)
        ).fetchone()
        conn.close()

        status["models"][mid] = {
            "model_loaded": loaded,
            "prod_version": prod_version,
            "last_drift_share": dict(last_drift)["drift_share"] if last_drift else None,
            "last_drift_status": dict(last_drift)["status"] if last_drift else "unknown",
            "last_check_ts": dict(last_drift)["ts"] if last_drift else None,
        }

    # Service availability — best-effort pings
    import requests as req_lib
    for svc, url in [
        ("mlflow", f"{MLFLOW_URI}/health"),
        ("api", "http://localhost:8000/health"),
    ]:
        try:
            r = req_lib.get(url, timeout=2)
            status["services"][svc] = "up" if r.status_code < 400 else "degraded"
        except Exception:
            status["services"][svc] = "down"

    return status


# ---------------------------------------------------------------------------
# API — Available Models list
# ---------------------------------------------------------------------------
@app.get("/api/models")
def list_models():
    result = []
    for mid, cfg in MODEL_CONFIGS.items():
        result.append({
            "id": mid,
            "display_name": cfg.get("display_name", mid),
            "drift_threshold": cfg["drift_threshold"],
            "consecutive_triggers": cfg["consecutive_triggers"],
        })
    return result


# ---------------------------------------------------------------------------
# API — Manual batch injection (for demo/testing)
# ---------------------------------------------------------------------------
@app.post("/api/inject-batch")
def inject_batch(model_id: str = "churn_model", batch_name: str = "batch_4_price_shift"):
    src = f"data/churn/batches/{batch_name}.csv"
    dest = "data/churn/incoming_batch.csv"
    try:
        import shutil
        shutil.copy(src, dest)
        from tasks import check_drift
        check_drift.delay(model_id, dest)
        return {"status": "ok", "batch": batch_name, "task": "check_drift queued"}
    except FileNotFoundError:
        raise HTTPException(404, f"Batch file not found: {src}")


# ---------------------------------------------------------------------------
# API — Feature importance (from Production model)
# ---------------------------------------------------------------------------
@app.get("/api/feature-importance")
def feature_importance(model_id: str = "churn_model"):
    with _model_lock:
        model = _models.get(model_id)
    if model is None:
        return []
    try:
        importances = model.feature_importances_
        cfg = MODEL_CONFIGS.get(model_id, {})
        features = cfg.get("features", [f"feature_{i}" for i in range(len(importances))])
        pairs = sorted(zip(features, importances), key=lambda x: x[1], reverse=True)
        return [{"feature": f, "importance": round(float(i), 4)} for f, i in pairs]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# API — Config (read-only view for Settings page)
# ---------------------------------------------------------------------------
@app.get("/api/config")
def get_config():
    safe = {}
    for mid, cfg in MODEL_CONFIGS.items():
        safe[mid] = {
            "display_name": cfg.get("display_name", mid),
            "drift_threshold": cfg["drift_threshold"],
            "consecutive_triggers": cfg["consecutive_triggers"],
            "max_rejection_rate": cfg["max_rejection_rate"],
            "features": cfg.get("features", []),
        }
    return safe
