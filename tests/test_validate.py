"""
DriftGuard — Tests for schema validation.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import pandas as pd
import pytest
from validate import validate_batch


def _good_churn_df(n=10) -> pd.DataFrame:
    return pd.DataFrame({
        "tenure": [i % 73 for i in range(n)],
        "MonthlyCharges": [float(20 + i) for i in range(n)],
        "TotalCharges": [float(100 + i * 10) for i in range(n)],
        "Contract": ["Month-to-month"] * n,
        "InternetService": ["Fiber optic"] * n,
        "TechSupport": ["No"] * n,
        "PaymentMethod": ["Electronic check"] * n,
    })


def test_all_clean_rows():
    df = _good_churn_df(20)
    clean, bad, rate = validate_batch(df, "churn_model")
    assert len(clean) == 20
    assert len(bad) == 0
    assert rate == 0.0


def test_negative_tenure_quarantined():
    df = _good_churn_df(10)
    df.loc[0, "tenure"] = -5   # invalid
    clean, bad, rate = validate_batch(df, "churn_model")
    assert 0 in bad.index
    assert len(bad) == 1
    assert round(rate, 2) == 0.10


def test_null_monthly_charges_quarantined():
    df = _good_churn_df(10)
    df.loc[3, "MonthlyCharges"] = None
    clean, bad, rate = validate_batch(df, "churn_model")
    assert 3 in bad.index


def test_rejection_rate_calculation():
    df = _good_churn_df(20)
    df.loc[[0, 1, 2, 3], "tenure"] = -1   # 4 bad rows
    _, _, rate = validate_batch(df, "churn_model")
    assert abs(rate - 0.20) < 1e-6


def test_empty_dataframe():
    df = pd.DataFrame(columns=["tenure", "MonthlyCharges", "TotalCharges"])
    clean, bad, rate = validate_batch(df, "churn_model")
    assert len(clean) == 0
    assert rate == 0.0


def test_extra_columns_allowed():
    """strict=False means extra columns (e.g. Churn label) pass through."""
    df = _good_churn_df(5)
    df["Churn"] = [0, 1, 0, 1, 0]
    clean, bad, rate = validate_batch(df, "churn_model")
    assert len(clean) == 5
    assert rate == 0.0


def test_all_bad_rows():
    df = _good_churn_df(5)
    df["tenure"] = -1
    df["MonthlyCharges"] = None
    clean, bad, rate = validate_batch(df, "churn_model")
    assert len(clean) == 0
    assert rate == 1.0
