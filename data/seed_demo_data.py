"""
DriftGuard — Demo data seeder.
Populates the SQLite database with realistic historical data so the
dashboard looks meaningful from the first launch.

Usage:
    cd /path/to/driftguard
    python data/seed_demo_data.py
"""
import os
import sys
import sqlite3
import datetime
import random

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from db import init_db, get_conn

random.seed(42)
now = datetime.datetime.utcnow()


def days_ago(n, hours=0, minutes=0):
    return (now - datetime.timedelta(days=n, hours=hours, minutes=minutes)).isoformat()


def seed():
    init_db()
    conn = get_conn()

    # -----------------------------------------------------------------------
    # Drift history — 30 batches, escalating drift from batch 18 onward
    # -----------------------------------------------------------------------
    drift_rows = []
    for i in range(30):
        ts = days_ago(30 - i, hours=random.randint(0, 23))
        base = 0.05 + random.uniform(0, 0.08)
        if i >= 18:
            base = 0.20 + (i - 18) * 0.025 + random.uniform(0, 0.05)
        drift_share = min(round(base, 3), 0.95)
        streak = max(0, i - 21) if i >= 18 else 0
        status = "drifting" if drift_share > 0.30 else "ok"
        features = "MonthlyCharges: 0.72; tenure: 0.45; Contract: 0.38" if drift_share > 0.30 else ""
        drift_rows.append((ts, "churn_model", f"batch_{i+1:03d}", drift_share, features, status, streak))

    conn.executemany(
        "INSERT INTO drift_history (ts, model_id, batch_id, drift_share, drifted_features, status, streak) VALUES (?,?,?,?,?,?,?)",
        drift_rows
    )

    # Fraud model — lower threshold, fewer batches
    for i in range(15):
        ts = days_ago(15 - i, hours=random.randint(0, 23))
        drift_share = round(0.04 + random.uniform(0, 0.12), 3)
        status = "drifting" if drift_share > 0.20 else "ok"
        conn.execute(
            "INSERT INTO drift_history (ts, model_id, batch_id, drift_share, drifted_features, status, streak) VALUES (?,?,?,?,?,?,?)",
            (ts, "fraud_model", f"fraud_batch_{i+1:03d}", drift_share, "", status, 0)
        )

    # -----------------------------------------------------------------------
    # Retrain history — 4 retrains, 3 promoted, 1 rejected
    # -----------------------------------------------------------------------
    retrains = [
        (days_ago(22), "churn_model", "drift_confirmed", 0.823, 0.801, "PROMOTED", "v2", 142.3),
        (days_ago(18), "churn_model", "drift_confirmed", 0.834, 0.823, "PROMOTED", "v3", 138.7),
        (days_ago(10), "churn_model", "drift_confirmed", 0.815, 0.834, "REJECTED", "v4", 145.1),
        (days_ago(5),  "churn_model", "drift_confirmed", 0.847, 0.834, "PROMOTED", "v5", 151.4),
        (days_ago(8),  "fraud_model", "drift_confirmed", 0.912, 0.904, "PROMOTED", "v2", 98.2),
    ]
    conn.executemany(
        "INSERT INTO retrain_history (ts, model_id, trigger_reason, candidate_f1, prod_f1, decision, new_version, duration_secs) VALUES (?,?,?,?,?,?,?,?)",
        retrains
    )

    # -----------------------------------------------------------------------
    # Audit log events
    # -----------------------------------------------------------------------
    events = [
        (days_ago(30), "churn_model", "COLD_START", "Pipeline initialized. Baseline model v1 loaded."),
        (days_ago(28), "churn_model", "DRIFT_CHECK", "drift_share=0.087 (threshold=0.30) streak=0/2"),
        (days_ago(24), "churn_model", "DRIFT_CHECK", "drift_share=0.122 (threshold=0.30) streak=0/2"),
        (days_ago(22), "churn_model", "DRIFT_CHECK", "drift_share=0.334 (threshold=0.30) streak=1/2"),
        (days_ago(22, 1), "churn_model", "DRIFT_CHECK", "drift_share=0.381 (threshold=0.30) streak=2/2"),
        (days_ago(22, 2), "churn_model", "DRIFT_CONFIRMED", "MonthlyCharges distribution shifted upward ~17%. Likely caused by a recent pricing change. Retraining triggered."),
        (days_ago(22, 3), "churn_model", "RETRAIN_TRIGGERED", "Champion-challenger evaluation started. Candidate training on merged dataset."),
        (days_ago(22, 4), "churn_model", "MODEL_PROMOTED", "v2 promoted | candidate F1=0.823 vs prod F1=0.801 | duration=142.3s"),
        (days_ago(18), "churn_model", "DRIFT_CONFIRMED", "Contract distribution shifted toward month-to-month. Suggests pricing plan changes. Retraining triggered."),
        (days_ago(18, 3), "churn_model", "MODEL_PROMOTED", "v3 promoted | candidate F1=0.834 vs prod F1=0.823 | duration=138.7s"),
        (days_ago(12), "churn_model", "DATA_QUALITY_ALERT", "18.3% of batch_020 rows failed schema validation. Treating as upstream data issue, not drift."),
        (days_ago(10), "churn_model", "DRIFT_CONFIRMED", "tenure and MonthlyCharges both drifted. Possible new customer acquisition campaign."),
        (days_ago(10, 2), "churn_model", "RETRAIN_REJECTED", "v4 rejected | candidate F1=0.815 < prod F1=0.834 | prod model keeps serving"),
        (days_ago(5),  "churn_model", "DRIFT_CONFIRMED", "Broad distribution shift across 4 features. New regional rollout detected. Retraining triggered."),
        (days_ago(5, 3), "churn_model", "MODEL_PROMOTED", "v5 promoted | candidate F1=0.847 vs prod F1=0.834 | duration=151.4s"),
        (days_ago(2),  "churn_model", "DRIFT_CHECK", "drift_share=0.091 (threshold=0.30) streak=0/2"),
        (days_ago(1),  "churn_model", "DRIFT_CHECK", "drift_share=0.103 (threshold=0.30) streak=0/2"),
        (days_ago(8),  "fraud_model", "DRIFT_CONFIRMED", "amount distribution shifted. Seasonal spending pattern shift detected."),
        (days_ago(8, 2), "fraud_model", "MODEL_PROMOTED", "v2 promoted | candidate F1=0.912 vs prod F1=0.904 | duration=98.2s"),
    ]
    conn.executemany(
        "INSERT INTO events (ts, model_id, event, message) VALUES (?,?,?,?)",
        events
    )

    # -----------------------------------------------------------------------
    # Data quality history
    # -----------------------------------------------------------------------
    quality_rows = []
    for i in range(30):
        ts = days_ago(30 - i, hours=random.randint(0, 23))
        total = random.randint(900, 1100)
        if i == 12:   # Batch 13 — the corrupted one
            rejection = round(random.uniform(0.17, 0.22), 3)
        else:
            rejection = round(random.uniform(0.01, 0.05), 3)
        quarantined = int(total * rejection)
        clean = total - quarantined
        status = "quarantined" if rejection > 0.15 else "ok"
        quality_rows.append((ts, "churn_model", f"batch_{i+1:03d}", total, clean, quarantined, rejection, status))

    conn.executemany(
        "INSERT INTO data_quality (ts, model_id, batch_id, total_rows, clean_rows, quarantined_rows, rejection_rate, status) VALUES (?,?,?,?,?,?,?,?)",
        quality_rows
    )

    # -----------------------------------------------------------------------
    # Stream stats
    # -----------------------------------------------------------------------
    stream_rows = []
    for i in range(48):
        ts = days_ago(2, hours=i % 24, minutes=random.randint(0, 59))
        eps = round(random.uniform(4.2, 5.8), 2)
        window = 500
        buffer = random.randint(480, 520)
        lag = random.randint(0, 30)
        drift = round(random.uniform(0.05, 0.18), 3)
        stream_rows.append((ts, "churn_model", eps, window, buffer, lag, drift))

    conn.executemany(
        "INSERT INTO stream_stats (ts, model_id, events_per_sec, window_size, buffer_size, consumer_lag, drift_share) VALUES (?,?,?,?,?,?,?)",
        stream_rows
    )

    conn.commit()
    conn.close()
    print("✅ Demo data seeded successfully.")
    print(f"   DB: {os.environ.get('DRIFTGUARD_DB', 'data/driftguard.db')}")


if __name__ == "__main__":
    seed()
