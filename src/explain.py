"""
DriftGuard — LLM-generated plain-English drift explanations via Ollama (local, free).
The explanation is supplementary only; numeric drift_share drives every gate decision.
A confused LLM sentence can make an audit entry less clear, but CANNOT cause a wrong
retrain decision.

Setup:
    curl -fsSL https://ollama.com/install.sh | sh
    ollama pull llama3.2:1b
"""
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "llama3.2:1b"
TIMEOUT_SECS = 8


def summarize_drifted_features(report_dict: dict, top_n: int = 3) -> str:
    """
    Pulls the most-drifted columns and their drift scores from the Evidently
    report dict so the LLM is grounded in real numbers rather than guessing.
    """
    try:
        drift_by_cols = report_dict["metrics"][1]["result"]["drift_by_columns"]
        ranked = sorted(
            drift_by_cols.items(),
            key=lambda kv: kv[1].get("drift_score", 0),
            reverse=True,
        )
        lines = [
            f"{name}: drift score {info.get('drift_score', 0):.2f}"
            for name, info in ranked[:top_n]
        ]
        return "; ".join(lines)
    except (KeyError, IndexError, TypeError):
        return "feature-level breakdown unavailable"


def explain_drift(drift_share: float, feature_summary: str) -> str:
    """
    Returns a two-sentence plain-English explanation grounded in actual stats.
    Gracefully degrades if Ollama is offline or slow.
    """
    prompt = (
        "You are an MLOps assistant. In two short sentences, plain English, "
        "explain why data drift may have been detected based on this summary. "
        "Do not invent specific causes you cannot see in the data — describe "
        "the observed pattern, then suggest one plausible business reason.\n\n"
        f"Overall drift share: {drift_share:.2f}\n"
        f"Most affected features: {feature_summary}"
    )

    try:
        resp = requests.post(
            OLLAMA_URL,
            json={"model": MODEL, "prompt": prompt, "stream": False},
            timeout=TIMEOUT_SECS,
        )
        resp.raise_for_status()
        return resp.json()["response"].strip()
    except (requests.RequestException, KeyError, ValueError):
        # Graceful degradation: pipeline never blocks waiting on the LLM.
        return (
            f"Drift detected (share={drift_share:.2f}). "
            "Automated explanation unavailable — Ollama may be offline or cold-loading."
        )
