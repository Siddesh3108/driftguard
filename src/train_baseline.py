"""
DriftGuard — Baseline model training.
Downloads the IBM Telco Churn dataset, trains a RandomForest baseline,
registers it in MLflow, and writes reference/holdout CSVs to disk.

Usage:
    python src/train_baseline.py

After running, promote v1 to Production:
    python -c "
    from mlflow.tracking import MlflowClient
    c = MlflowClient()
    c.transition_model_version_stage('churn_model', '1', 'Production')
    print('v1 promoted to Production')
    "
"""
import os
import sys
import mlflow
import mlflow.sklearn
import pandas as pd
import numpy as np
from mlflow.tracking import MlflowClient
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

DATA_URL = (
    "https://raw.githubusercontent.com/IBM/telco-customer-churn-on-icp4d"
    "/master/data/Telco-Customer-Churn.csv"
)

os.makedirs("data/churn", exist_ok=True)
os.makedirs("data/churn/batches", exist_ok=True)
os.makedirs("data/fraud", exist_ok=True)
os.makedirs("mlruns", exist_ok=True)


def load_and_preprocess() -> pd.DataFrame:
    print("Downloading dataset...")
    df = pd.read_csv(DATA_URL)
    df = df.drop(columns=["customerID"])
    df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")
    df = df.dropna()
    for col in df.select_dtypes(include="object").columns:
        df[col] = LabelEncoder().fit_transform(df[col].astype(str))
    return df


def generate_drift_batches(df: pd.DataFrame) -> None:
    """
    Creates deliberately distorted batches to simulate real-world drift scenarios
    for demo/interview use. See Section 4 of the documentation.
    """
    np.random.seed(42)
    n = len(df)

    # Batch 3 — oversample month-to-month contracts (value 0 after encoding)
    b3 = df.copy()
    mtm_mask = b3["Contract"] == 0
    extra = b3[mtm_mask].sample(frac=0.4, random_state=1)
    b3 = pd.concat([b3, extra]).sample(frac=1, random_state=1).reset_index(drop=True)
    b3.to_csv("data/churn/batches/batch_3_contract_shift.csv", index=False)

    # Batch 4 — MonthlyCharges shifted upward 15-20%
    b4 = df.copy()
    multiplier = np.random.uniform(1.15, 1.20, size=len(b4))
    b4["MonthlyCharges"] = (b4["MonthlyCharges"] * multiplier).round(2)
    b4["TotalCharges"] = (b4["TotalCharges"] * multiplier).round(2)
    b4.to_csv("data/churn/batches/batch_4_price_shift.csv", index=False)

    # Batch 5 — 5% corrupted/missing rows (simulates broken upstream feed)
    b5 = df.copy()
    bad_idx = np.random.choice(b5.index, size=int(0.05 * len(b5)), replace=False)
    b5.loc[bad_idx, "tenure"] = -1          # invalid: below ge(0)
    b5.loc[bad_idx, "MonthlyCharges"] = None
    b5.to_csv("data/churn/batches/batch_5_corrupted.csv", index=False)

    # Batch 8 — synthetic new-region population shift
    b8 = df.copy()
    b8["tenure"] = np.clip(
        b8["tenure"] + np.random.normal(12, 5, size=len(b8)), 0, 72
    ).astype(int)
    b8["MonthlyCharges"] = np.clip(
        b8["MonthlyCharges"] + np.random.normal(20, 8, size=len(b8)), 10, 200
    ).round(2)
    b8.to_csv("data/churn/batches/batch_8_region_shift.csv", index=False)

    print("Drift simulation batches written to data/churn/batches/")


def main() -> None:
    df = load_and_preprocess()

    X = df.drop(columns=["Churn"])
    y = df["Churn"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "http://mlflow:5000"))
    mlflow.set_experiment("driftguard-churn")

    with mlflow.start_run(run_name="baseline_model") as run:
        model = RandomForestClassifier(
            n_estimators=200, max_depth=8, random_state=42, n_jobs=-1
        )
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        proba = model.predict_proba(X_test)[:, 1]

        acc = accuracy_score(y_test, preds)
        f1 = f1_score(y_test, preds)
        auc = roc_auc_score(y_test, proba)

        mlflow.log_params({"n_estimators": 200, "max_depth": 8, "random_state": 42})
        mlflow.log_metrics({"accuracy": acc, "f1_score": f1, "roc_auc": auc})

        model_info = mlflow.sklearn.log_model(
            model,
            artifact_path="model",
            registered_model_name="churn_model",
        )
        print(
            f"Baseline trained — Accuracy={acc:.3f}  F1={f1:.3f}  AUC={auc:.3f}\n"
            f"Run ID: {run.info.run_id}"
        )

    # Save reference data (training features) and holdout set
    X_train.to_csv("data/churn/reference_data.csv", index=False)
    X_test.assign(Churn=y_test.values).to_csv("data/churn/holdout_eval_set.csv", index=False)
    print("Reference and holdout CSVs saved.")

    # Promote v1 to Production automatically
    client = MlflowClient()
    client.transition_model_version_stage(
        name="churn_model", version="1", stage="Production"
    )
    print("churn_model v1 promoted to Production.")

    # Generate demo drift batches
    generate_drift_batches(df)


if __name__ == "__main__":
    main()
