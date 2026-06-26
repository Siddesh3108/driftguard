"""
DriftGuard — Notification and audit logging.
SQLite is always written first; Slack delivery is best-effort.
A Slack outage NEVER breaks the pipeline.
"""
import os
import requests
import redis

from db import log_event, init_db

SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")
SLACK_TIMEOUT = 5
COOLDOWN_SECONDS = 300  # prevent channel spam on burst alerts

_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = redis.Redis(
                host=os.environ.get("REDIS_HOST", "redis"),
                port=int(os.environ.get("REDIS_PORT", 6379)),
                db=2,
                socket_connect_timeout=2,
            )
        except Exception:
            pass
    return _redis_client


EVENT_EMOJI = {
    "MODEL_PROMOTED": "✅",
    "RETRAIN_TRIGGERED": "🔄",
    "RETRAIN_REJECTED": "🛡️",
    "DATA_QUALITY_ALERT": "⚠️",
    "DRIFT_CONFIRMED": "📊",
    "DRIFT_CHECK": "📡",
    "COLD_START": "🚀",
    "ROLLBACK": "⏪",
    "STREAM_DRIFT": "🌊",
    "MODEL_LOADED": "📦",
}


def _should_send_slack(event: str) -> bool:
    """Rate-limit Slack alerts per event type to avoid channel spam."""
    r = _get_redis()
    if r is None:
        return True
    key = f"slack_cooldown:{event}"
    try:
        if r.setnx(key, "1"):
            r.expire(key, COOLDOWN_SECONDS)
            return True
        return False
    except Exception:
        return True  # if Redis is unavailable, send anyway


def notify(event: str, message: str, model_id: str = "churn_model") -> None:
    """
    1. Always writes to the SQLite audit log.
    2. Optionally sends to Slack if SLACK_WEBHOOK_URL is set.
    """
    init_db()
    log_event(model_id, event, message)

    if not SLACK_WEBHOOK_URL:
        print(f"[{event}] ({model_id}) {message}")
        return

    if not _should_send_slack(event):
        return

    emoji = EVENT_EMOJI.get(event, "ℹ️")
    text = (
        f"{emoji} *{event.replace('_', ' ').title()}*  |  `{model_id}`\n{message}"
    )
    try:
        requests.post(
            SLACK_WEBHOOK_URL,
            json={"text": text},
            timeout=SLACK_TIMEOUT,
        )
    except requests.RequestException as exc:
        # Slack failure must never propagate — log locally and move on
        print(f"Slack notify failed ({exc}); audit log still written.")
