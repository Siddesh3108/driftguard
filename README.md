# DriftGuard — Self-Healing MLOps Pipeline

A production-grade MLOps pipeline that **automatically detects data drift and retrains ML models** without manual intervention. Built as a portfolio project demonstrating the full range of AI engineering: model training, production reliability, real-time systems, applied LLM usage, multi-tenant architecture, and a polished React dashboard.

---

## Architecture

```
Incoming Data ──► Celery Beat (scheduler) ──► Drift Detector (Evidently AI)
                                                        │
                                            drift_share > threshold?
                                         (debounced via Redis streak counter)
                                                        │
                                         Retrain Trigger (Redis lock prevents
                                            duplicate concurrent retrains)
                                                        │
                                          Champion vs. Challenger Gate
                                       (new model only promoted if it beats prod)
                                                        │
                                        MLflow Model Registry (versioned,
                                              one-command rollback)
                                                        │
                               ┌─────────────────────────────────────────┐
                               ▼                                         ▼
                    FastAPI Serving Layer                      React Dashboard (10 pages)
                 (always loads "Production")           Overview · Drift · Performance ·
                                                       Analytics · Quality · Stream ·
                                                       Registry · Audit · Try It · Settings
```

---

## Tech Stack (100% Free)

| Layer | Tool |
|-------|------|
| Model training | scikit-learn |
| Experiment tracking & registry | MLflow |
| Drift detection | Evidently AI |
| Async task orchestration | Celery + Redis |
| Real-time streaming | Redis Streams |
| LLM drift explanations | Ollama (local, free) |
| Alerting | Slack Incoming Webhooks |
| API | FastAPI |
| Frontend | React + Vite + Recharts + lucide-react |
| CI/CD | GitHub Actions |
| Containers | Docker + docker-compose |

---

## Quick Start

### 1. Prerequisites
- Docker Desktop (or Docker + docker-compose)
- Python 3.11+ (for the initial training script)
- Node.js 20+ (only needed for local frontend dev without Docker)

### 2. Clone and configure
```bash
git clone https://github.com/your-username/driftguard.git
cd driftguard
cp .env.example .env
# Edit .env — SLACK_WEBHOOK_URL is optional
```

### 3. Train the baseline model
```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python src/train_baseline.py
```

This downloads the IBM Telco Churn dataset, trains a RandomForest baseline,
registers it in MLflow as `churn_model v1 (Production)`, and generates all
drift simulation batches.

### 4. Seed demo data (optional but recommended)
```bash
python data/seed_demo_data.py
```

Populates the SQLite database with 30 days of realistic drift history, retrain events, and audit log entries so the dashboard looks meaningful immediately.

### 5. Start everything
```bash
docker compose up --build
```

Open **http://localhost** — the React dashboard is served via Nginx.

---

## Demo Walkthrough (Interview Script)

**Part 1 — Correct drift trigger**
1. Go to Settings → click **Inject → Price Hike**
2. Watch Drift Monitor: drift_share spikes above threshold
3. After 2 consecutive confirmations, check Audit Log for `DRIFT_CONFIRMED`
4. Check Model Registry — new version appears, promoted if F1 improves

**Part 2 — Correct data-quality refusal**
1. Settings → inject **Corrupt Data**
2. Drift Monitor shows no new drift detection
3. Audit Log shows `DATA_QUALITY_ALERT` — the system correctly identified this as a data issue, not drift

This two-part demo is far more convincing than a clean happy-path run. It shows **judgment**, not just automation.

---

## Dashboard Pages

| Page | What it shows |
|------|---------------|
| **Overview** | Pipeline status strip, key metrics, drift sparkline, activity feed |
| **Drift Monitor** | Drift share over time, feature-level drift, threshold visualization, batch log |
| **Performance** | F1/Accuracy/AUC trends, champion-challenger bar chart, retrain history |
| **Analytics** | Feature importance bars + radar, drift scatter, outcome distribution |
| **Data Quality** | Rejection rates, health trend, quarantine log, alert batches |
| **Stream Monitor** | Events/sec throughput, consumer lag, buffer utilization, window drift |
| **Model Registry** | All versions with metrics, one-click rollback, zero downtime |
| **Audit Log** | Searchable/filterable, CSV export, color-coded by event type |
| **Try It** | Live prediction form with probability gauge and risk indicator |
| **Settings** | Config view, demo batch injector, tech stack, quick start |

---

## Edge Cases Handled

| Situation | How DriftGuard handles it |
|-----------|--------------------------|
| False-positive drift | Debounce requires N consecutive confirmations |
| No ground-truth labels | Retraining deferred; human alerted |
| Retrained model is worse | Champion-challenger gate rejects it; old model keeps serving |
| Duplicate retrain triggers | Redis lock (with TTL) ensures only one retrain runs |
| Corrupt incoming data | Schema validation quarantines bad rows before drift check |
| Ollama offline | 8-second timeout with graceful fallback message |
| Slack outage | SQLite audit log always written first; Slack failure is caught |
| Cold start | Drift checks disabled until minimum reference data collected |
| Multiple models | Per-model Redis keys, thresholds, and registry entries |

---

## LLM Explanations (Optional)

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:1b
```

When drift is confirmed, a local LLM generates a plain-English explanation
grounded in the actual computed feature statistics. The explanation is
**supplementary only** — the numeric drift_share drives every gate decision.

---

## Deploying for Portfolio

- **Dashboard + API**: Render or Railway free tier
- **Simple demo**: `docker-compose.yml` + demo video linked in the README
- **MLflow**: Mount a volume; SQLite backend works fine for a demo

---

## Resume Bullets

- Engineered a self-healing MLOps pipeline (MLflow · Evidently AI · Celery/Redis) that auto-detects data drift and retrains models without manual intervention
- Designed a champion-challenger gate in MLflow Model Registry, preventing underperforming models from reaching production
- Implemented debounced, Redis-lock-based trigger logic to eliminate duplicate retrains and false-positive drift alerts
- Containerized a 7-service MLOps stack with Docker Compose — one-command deploy, zero-downtime model swaps
- Built a 10-page React monitoring dashboard consuming a FastAPI backend with real-time drift, performance, and stream analytics
- Extended pipeline to consume Redis Streams with consumer-group at-least-once delivery for continuous drift evaluation
- Integrated local LLM (Ollama) for plain-English drift explanations with graceful fallback if model is unavailable
- Generalized to multi-tenant architecture: config-driven per-model namespacing of locks, thresholds, and registry entries
- Added real-time Slack alerting with cooldown logic and audit-log-first design so a Slack outage never breaks the pipeline

---

*Built by Siddesh Lohkare — June 2026*
