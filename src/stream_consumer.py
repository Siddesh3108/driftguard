"""
DriftGuard — Rolling-window stream consumer.
Reads from Redis Streams using a consumer group (at-least-once delivery).
Every WINDOW_SIZE events, drift is evaluated against the reference data.

Usage:
    python src/stream_consumer.py
    python src/stream_consumer.py --model fraud_model
"""
import os
import sys
import json
import time
import argparse
import redis
import pandas as pd

from tasks import check_drift_on_window
from db import log_stream_stats, init_db

REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
STREAM = "customer_events"
GROUP = "drift_consumers"
WINDOW_SIZE = 500
MAX_STREAM_LENGTH = 100_000
BATCH_SIZE = 50
BLOCK_MS = 5000


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="churn_model")
    parser.add_argument("--window", type=int, default=WINDOW_SIZE)
    args = parser.parse_args()

    init_db()
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=3, decode_responses=True)

    try:
        r.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
        print(f"Consumer group '{GROUP}' created.")
    except redis.exceptions.ResponseError:
        print(f"Consumer group '{GROUP}' already exists — resuming from last offset.")

    window: list = []
    events_total = 0
    consumer_id = f"consumer-{os.getpid()}"
    t0 = time.time()

    print(f"Stream consumer started | model={args.model} | window={args.window} | consumer={consumer_id}")

    while True:
        entries = r.xreadgroup(
            GROUP, consumer_id,
            {STREAM: ">"},
            count=BATCH_SIZE,
            block=BLOCK_MS,
        )

        if not entries:
            continue

        for _, records in entries:
            for entry_id, fields in records:
                try:
                    event = json.loads(fields["data"])
                    window.append(event)
                    events_total += 1
                    # Acknowledge only after processing to guarantee at-least-once
                    r.xack(STREAM, GROUP, entry_id)
                except (json.JSONDecodeError, KeyError):
                    r.xack(STREAM, GROUP, entry_id)  # drop malformed events

        if len(window) >= args.window:
            df = pd.DataFrame(window[-args.window :])
            result = check_drift_on_window(df, model_id=args.model)

            elapsed = time.time() - t0
            eps = events_total / max(elapsed, 1)
            lag_info = r.xpending(STREAM, GROUP)
            consumer_lag = lag_info["pending"] if isinstance(lag_info, dict) else 0

            log_stream_stats(
                model_id=args.model,
                events_per_sec=round(eps, 2),
                window_size=len(df),
                buffer_size=len(window),
                consumer_lag=consumer_lag,
                drift_share=result.get("drift_share", 0.0),
            )

            print(
                f"  Window evaluated | drift_share={result.get('drift_share', 0):.3f} "
                f"| streak={result.get('streak', 0)} | eps={eps:.1f}"
            )

            # Keep a rolling tail; don't clear to zero so the next window overlaps
            window = window[-args.window :]

        # Trim the stream to prevent unbounded Redis memory growth
        r.xtrim(STREAM, maxlen=MAX_STREAM_LENGTH, approximate=True)


if __name__ == "__main__":
    main()
