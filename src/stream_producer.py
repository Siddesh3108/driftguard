"""
DriftGuard — Simulated live event stream producer.
Writes customer events to Redis Streams at ~5 events/sec.
In a real system this is replaced by your application's event publisher.

Usage:
    python src/stream_producer.py
    python src/stream_producer.py --drift  # inject price-shift drift
"""
import os
import sys
import json
import time
import random
import argparse
import redis

REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
STREAM = "customer_events"
SLEEP = 0.2  # 5 events/sec

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=3, decode_responses=True)


def normal_event() -> dict:
    return {
        "tenure": random.randint(0, 72),
        "MonthlyCharges": round(random.uniform(20.0, 90.0), 2),
        "TotalCharges": round(random.uniform(0.0, 5000.0), 2),
        "Contract": random.choice([0, 1, 2]),          # 0=month-to-month, 1=one year, 2=two year
        "InternetService": random.choice([0, 1, 2]),
        "TechSupport": random.choice([0, 1]),
        "PaymentMethod": random.choice([0, 1, 2, 3]),
    }


def drifted_event() -> dict:
    """Simulates a price-hike drift scenario (Batch 4)."""
    evt = normal_event()
    evt["MonthlyCharges"] = round(evt["MonthlyCharges"] * random.uniform(1.15, 1.20), 2)
    evt["TotalCharges"] = round(evt["TotalCharges"] * random.uniform(1.15, 1.20), 2)
    evt["Contract"] = 0  # oversample month-to-month
    return evt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--drift", action="store_true", help="Inject drift scenario")
    parser.add_argument("--rate", type=float, default=5.0, help="Events per second")
    args = parser.parse_args()

    sleep = 1.0 / max(args.rate, 0.1)
    gen = drifted_event if args.drift else normal_event
    mode = "DRIFT" if args.drift else "NORMAL"

    print(f"Stream producer started — mode={mode}  rate={args.rate}/sec  stream={STREAM}")
    count = 0
    try:
        while True:
            event = gen()
            r.xadd(STREAM, {"data": json.dumps(event)})
            count += 1
            if count % 100 == 0:
                length = r.xlen(STREAM)
                print(f"  {count} events sent — stream length: {length}")
            time.sleep(sleep)
    except KeyboardInterrupt:
        print(f"\nStopped after {count} events.")


if __name__ == "__main__":
    main()
