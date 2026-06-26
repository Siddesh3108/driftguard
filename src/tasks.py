"""
DriftGuard — Celery async tasks.
  check_drift      — scheduled every hour via Celery Beat
  retrain_model    — triggered by confirmed, persistent drift
  check_drift_on_window — called by stream_consumer with a live DataFrame
"""
import os
import sys
import time
import datetime
import pandas as pd
import redis
import mlflow
import mlflow.sklearn
from mlflow.tracking import MlflowClient
from celery import Celery
from celery.schedules import crontab
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score
import yaml

from validate import validate_batch
from notify import notify
from explain import explain_drift, summarize_drifted_features
from db import init_db, log_drift, log_data_quality, log_retrain

# ---------------------------------------------------------------------------
# Evidently imports — wrapped so the worker starts even if Evidently is absent
# ---------------------------------------------------------------------------
try:
    from evidently.report import Report
    from evidently.metric_preset import DataDriftPreset
    EVIDENTLY_AVAILABLE = True
except ImportError:
    EVIDENTLY_AVAILABLE = False
    print("WARNING: evidently not installed — drift detection disabled.")

# ---------------------------------------------------------------------------
# Celery + Redis setup
# ---------------------------------------------------------------------------
REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://mlflow:5000")

app = Celery(
    "driftguard",
    broker=f"redis://{REDIS_HOST}:{REDIS_PORT}/0",
    backend=f"redis://{REDIS_HOST}:{REDIS_PORT}/1",
)

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=2)
mlflow.set_tracking_uri(MLFLOW_URI)

# ---------------------------------------------------------------------------
# Load multi-tenant config
# ---------------------------------------------------------------------------
with open("config/models.yaml") as f:
    MODEL_CONFIGS = yaml.safe_load(f)["models"]

# ---------------------------------------------------------------------------
# Celery Beat schedule — one job per model
# ---------------------------------------------------------------------------
app.conf.beat_schedule = {
    f"check-drift-{mid}": {
        "task": "tasks.check_drift",
        "schedule": crontab(minute=0),
        "args": (mid, cfg.get("reference_data", f"data/churn/incoming_batch.csv")),
    }
    for mid, cfg in MODEL_CONFIGS.items()
}


# ---------------------------------------------------------------------------
# Drift detection helper
# ---------------------------------------------------------------------------
def _run_evidently(reference: pd.DataFrame, current: pd.DataFrame) -> tuple:
    """Returns (drift_share, report_dict, drifted_features_str)."""
    if not EVIDENTLY_AVAILABLE:
        return 0.0, {}, ""
    report = Report(metrics=[DataDriftPreset()])
    report.run(reference_data=reference, current_data=current)
    report_dict = report.as_dict()
    drift_share = report_dict["metrics"][0]["result"]["share_of_drifted_columns"]
    feature_summary = summarize_drifted_features(report_dict)
    return drift_share, report_dict, feature_summary


# ---------------------------------------------------------------------------
# Task: check_drift
# ---------------------------------------------------------------------------
@app.task(name="tasks.check_drift")
def check_drift(model_id: str = "churn_model",
                batch_path: str = "data/churn/incoming_batch.csv") -> dict:
    init_db()
    cfg = MODEL_CONFIGS.get(model_id, MODEL_CONFIGS["churn_model"])
    threshold = cfg["drift_threshold"]
    triggers_needed = cfg["consecutive_triggers"]
    max_rejection = cfg["max_rejection_rate"]

    try:
        reference = pd.read_csv(cfg["reference_data"])
    except FileNotFoundError:
        notify("COLD_START", "Reference data not found — run train_baseline.py first.", model_id)
        return {"status": "cold_start"}

    try:
        raw_batch = pd.read_csv(batch_path)
    except FileNotFoundError:
        return {"status": "no_batch", "batch_path": batch_path}

    batch_id = f"batch_{datetime.datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

    # --- Schema validation ------------------------------------------------
    clean, quarantined, rejection_rate = validate_batch(raw_batch, model_id)
    log_data_quality(
        model_id, batch_id, len(raw_batch), len(clean),
        len(quarantined), rejection_rate,
        "quarantined" if rejection_rate > max_rejection else "ok"
    )

    if rejection_rate > max_rejection:
        msg = (
            f"{rejection_rate:.1%} of rows in batch failed schema validation "
            f"({len(quarantined)}/{len(raw_batch)}). Treating as data-quality issue, "
            "not drift — retraining NOT triggered."
        )
        notify("DATA_QUALITY_ALERT", msg, model_id)
        log_drift(model_id, batch_id, 0.0, "", "quarantined", 0)
        return {"status": "quarantined", "rejection_rate": rejection_rate}

    # --- Drift detection --------------------------------------------------
    # Drop label column from current data if present to match reference shape
    label_col = cfg.get("label_column", "Churn")
    current = clean.drop(columns=[label_col], errors="ignore")
    ref_cols = reference.columns.tolist()
    current = current[[c for c in ref_cols if c in current.columns]]

    drift_share, report_dict, feature_summary = _run_evidently(reference, current)

    # --- Debounce (streak counter) ----------------------------------------
    streak_key = f"drift_streak:{model_id}"
    if drift_share > threshold:
        streak = int(r.incr(streak_key))
    else:
        r.set(streak_key, 0)
        streak = 0

    status = "drifting" if drift_share > threshold else "ok"
    log_drift(model_id, batch_id, drift_share, feature_summary, status, streak)
    notify(
        "DRIFT_CHECK",
        f"drift_share={drift_share:.3f} (threshold={threshold}) streak={streak}/{triggers_needed}",
        model_id,
    )

    # --- Trigger retrain if streak >= needed ------------------------------
    lock_key = f"retrain_lock:{model_id}"
    if streak >= triggers_needed:
        if r.setnx(lock_key, "1"):
            r.expire(lock_key, cfg["retrain_lock_ttl"])
            explanation = explain_drift(drift_share, feature_summary)
            notify("DRIFT_CONFIRMED", explanation, model_id)
            retrain_model.delay(model_id, batch_path)
            r.set(streak_key, 0)

    return {
        "model_id": model_id,
        "drift_share": drift_share,
        "streak": streak,
        "status": status,
    }


# ---------------------------------------------------------------------------
# Task: retrain_model
# ---------------------------------------------------------------------------
@app.task(name="tasks.retrain_model")
def retrain_model(model_id: str = "churn_model",
                  batch_path: str = "data/churn/incoming_batch.csv") -> dict:
    init_db()
    cfg = MODEL_CONFIGS.get(model_id, MODEL_CONFIGS["churn_model"])
    label_col = cfg.get("label_column", "Churn")
    lock_key = f"retrain_lock:{model_id}"
    start = time.time()

    try:
        new_data = pd.read_csv(batch_path)
        clean_data, _, _ = validate_batch(new_data, model_id)
        reference = pd.read_csv(cfg["reference_data"])

        # ---- Label availability check ------------------------------------
        # In production, labels for new rows arrive days/weeks later.
        # If the label column is missing, defer retraining and alert a human.
        if label_col not in clean_data.columns:
            notify(
                "RETRAIN_TRIGGERED",
                f"Labels ({label_col}) not yet available for new batch — "
                "retraining deferred until ground-truth outcomes are received.",
                model_id,
            )
            return {"status": "deferred_no_labels"}

        combined = pd.concat([reference.assign(**{label_col: 0}), clean_data])
        combined = combined.drop_duplicates()

        X = combined.drop(columns=[label_col])
        y = combined[label_col]

        candidate = RandomForestClassifier(
            n_estimators=200, max_depth=8, random_state=42, n_jobs=-1
        )
        candidate.fit(X, y)

        # ---- Champion-challenger evaluation ------------------------------
        holdout = pd.read_csv(cfg["holdout_data"])
        Xh = holdout.drop(columns=[label_col])
        yh = holdout[label_col]

        candidate_f1 = f1_score(yh, candidate.predict(Xh))

        try:
            current_prod = mlflow.sklearn.load_model(f"models:/{model_id}/Production")
            current_f1 = f1_score(yh, current_prod.predict(Xh))
        except Exception:
            current_f1 = 0.0

        # ---- Log to MLflow -----------------------------------------------
        mlflow.set_experiment(f"driftguard-{model_id}")
        with mlflow.start_run(run_name="auto_retrain_candidate") as run:
            mlflow.log_metric("candidate_f1", candidate_f1)
            mlflow.log_metric("current_prod_f1", current_f1)
            mlflow.log_param("trigger", "drift_confirmed")

            info = mlflow.sklearn.log_model(
                candidate,
                artifact_path="model",
                registered_model_name=model_id,
            )

            client = MlflowClient()
            new_version = info.registered_model_version
            duration = round(time.time() - start, 1)

            if candidate_f1 >= current_f1:
                client.transition_model_version_stage(
                    name=model_id,
                    version=new_version,
                    stage="Production",
                    archive_existing_versions=True,
                )
                mlflow.set_tag("decision", "PROMOTED")
                notify(
                    "MODEL_PROMOTED",
                    f"v{new_version} promoted | candidate F1={candidate_f1:.3f} "
                    f"vs prod F1={current_f1:.3f} | duration={duration}s",
                    model_id,
                )
                log_retrain(model_id, "drift_confirmed", candidate_f1, current_f1,
                            "PROMOTED", f"v{new_version}", duration)
            else:
                mlflow.set_tag("decision", "REJECTED")
                notify(
                    "RETRAIN_REJECTED",
                    f"v{new_version} rejected | candidate F1={candidate_f1:.3f} "
                    f"< prod F1={current_f1:.3f} | prod model keeps serving",
                    model_id,
                )
                log_retrain(model_id, "drift_confirmed", candidate_f1, current_f1,
                            "REJECTED", f"v{new_version}", duration)

            return {
                "model_id": model_id,
                "version": new_version,
                "candidate_f1": candidate_f1,
                "current_f1": current_f1,
                "decision": "PROMOTED" if candidate_f1 >= current_f1 else "REJECTED",
            }

    finally:
        # Always release the lock, even if an exception occurred
        r.delete(lock_key)


# ---------------------------------------------------------------------------
# Streaming entry point (called by stream_consumer directly, not via Celery)
# ---------------------------------------------------------------------------
def check_drift_on_window(df: pd.DataFrame, model_id: str = "churn_model") -> dict:
    """
    Same debounce + lock logic as check_drift, but accepts an in-memory
    DataFrame from the rolling stream window instead of a CSV path.
    Called directly by stream_consumer (not dispatched as a Celery task).
    """
    init_db()
    cfg = MODEL_CONFIGS.get(model_id, MODEL_CONFIGS["churn_model"])
    threshold = cfg["drift_threshold"]
    triggers_needed = cfg["consecutive_triggers"]
    max_rejection = cfg["max_rejection_rate"]

    try:
        reference = pd.read_csv(cfg["reference_data"])
    except FileNotFoundError:
        return {"status": "cold_start"}

    batch_id = f"stream_{datetime.datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
    clean, quarantined, rejection_rate = validate_batch(df, model_id)

    log_data_quality(
        model_id, batch_id, len(df), len(clean), len(quarantined),
        rejection_rate, "quarantined" if rejection_rate > max_rejection else "ok"
    )

    if rejection_rate > max_rejection:
        notify("DATA_QUALITY_ALERT",
               f"Stream window: {rejection_rate:.1%} rows failed validation", model_id)
        return {"status": "quarantined"}

    label_col = cfg.get("label_column", "Churn")
    current = clean.drop(columns=[label_col], errors="ignore")
    ref_cols = reference.columns.tolist()
    current = current[[c for c in ref_cols if c in current.columns]]

    drift_share, _, feature_summary = _run_evidently(reference, current)

    streak_key = f"drift_streak:{model_id}"
    if drift_share > threshold:
        streak = int(r.incr(streak_key))
    else:
        r.set(streak_key, 0)
        streak = 0

    log_drift(model_id, batch_id, drift_share, feature_summary,
              "drifting" if drift_share > threshold else "ok", streak)

    lock_key = f"retrain_lock:{model_id}"
    if streak >= triggers_needed:
        if r.setnx(lock_key, "1"):
            r.expire(lock_key, cfg["retrain_lock_ttl"])
            explanation = explain_drift(drift_share, feature_summary)
            notify("DRIFT_CONFIRMED", f"[stream] {explanation}", model_id)
            retrain_model.delay(model_id, cfg["reference_data"])
            r.set(streak_key, 0)

    return {"drift_share": drift_share, "streak": streak}
