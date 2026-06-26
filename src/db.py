"""
DriftGuard — SQLite database helpers.
All tables are created on first connection so there is no separate migration step.
"""
import sqlite3
import datetime
import os

DB_PATH = os.environ.get("DRIFTGUARD_DB", "data/driftguard.db")


def get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS events (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            ts      TEXT    NOT NULL,
            model_id TEXT   NOT NULL DEFAULT 'churn_model',
            event   TEXT    NOT NULL,
            message TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS drift_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            ts              TEXT    NOT NULL,
            model_id        TEXT    NOT NULL,
            batch_id        TEXT    NOT NULL,
            drift_share     REAL    NOT NULL,
            drifted_features TEXT,
            status          TEXT    NOT NULL,
            streak          INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS data_quality (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            ts              TEXT    NOT NULL,
            model_id        TEXT    NOT NULL,
            batch_id        TEXT    NOT NULL,
            total_rows      INTEGER NOT NULL,
            clean_rows      INTEGER NOT NULL,
            quarantined_rows INTEGER NOT NULL,
            rejection_rate  REAL    NOT NULL,
            status          TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS retrain_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            ts              TEXT    NOT NULL,
            model_id        TEXT    NOT NULL,
            trigger_reason  TEXT,
            candidate_f1    REAL,
            prod_f1         REAL,
            decision        TEXT    NOT NULL,
            new_version     TEXT,
            duration_secs   REAL
        );

        CREATE TABLE IF NOT EXISTS stream_stats (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            ts              TEXT    NOT NULL,
            model_id        TEXT    NOT NULL,
            events_per_sec  REAL    DEFAULT 0,
            window_size     INTEGER DEFAULT 0,
            buffer_size     INTEGER DEFAULT 0,
            consumer_lag    INTEGER DEFAULT 0,
            drift_share     REAL    DEFAULT 0
        );
    """)
    conn.commit()
    conn.close()


def log_event(model_id: str, event: str, message: str) -> None:
    conn = get_conn()
    conn.execute(
        "INSERT INTO events (ts, model_id, event, message) VALUES (?, ?, ?, ?)",
        (datetime.datetime.utcnow().isoformat(), model_id, event, message),
    )
    conn.commit()
    conn.close()


def log_drift(model_id: str, batch_id: str, drift_share: float,
              drifted_features: str, status: str, streak: int) -> None:
    conn = get_conn()
    conn.execute(
        """INSERT INTO drift_history
           (ts, model_id, batch_id, drift_share, drifted_features, status, streak)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (datetime.datetime.utcnow().isoformat(), model_id, batch_id,
         drift_share, drifted_features, status, streak),
    )
    conn.commit()
    conn.close()


def log_data_quality(model_id: str, batch_id: str, total: int,
                     clean: int, quarantined: int, rate: float, status: str) -> None:
    conn = get_conn()
    conn.execute(
        """INSERT INTO data_quality
           (ts, model_id, batch_id, total_rows, clean_rows, quarantined_rows,
            rejection_rate, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (datetime.datetime.utcnow().isoformat(), model_id, batch_id,
         total, clean, quarantined, rate, status),
    )
    conn.commit()
    conn.close()


def log_retrain(model_id: str, trigger_reason: str, candidate_f1: float,
                prod_f1: float, decision: str, new_version: str,
                duration_secs: float) -> None:
    conn = get_conn()
    conn.execute(
        """INSERT INTO retrain_history
           (ts, model_id, trigger_reason, candidate_f1, prod_f1, decision,
            new_version, duration_secs)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (datetime.datetime.utcnow().isoformat(), model_id, trigger_reason,
         candidate_f1, prod_f1, decision, new_version, duration_secs),
    )
    conn.commit()
    conn.close()


def log_stream_stats(model_id: str, events_per_sec: float, window_size: int,
                     buffer_size: int, consumer_lag: int, drift_share: float) -> None:
    conn = get_conn()
    conn.execute(
        """INSERT INTO stream_stats
           (ts, model_id, events_per_sec, window_size, buffer_size,
            consumer_lag, drift_share)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (datetime.datetime.utcnow().isoformat(), model_id, events_per_sec,
         window_size, buffer_size, consumer_lag, drift_share),
    )
    conn.commit()
    conn.close()
