"""
DriftGuard — Schema validation.
Runs before any drift statistics are computed.
Bad rows are quarantined; a rejection rate above MAX_REJECTION_RATE
raises a DATA_QUALITY_ALERT instead of a drift alert.
"""
import pandera.pandas as pa
from pandera.pandas import Column, Check
import pandas as pd
from typing import Tuple

churn_schema = pa.DataFrameSchema(
    {
        "tenure": Column(int, Check.ge(0), nullable=False),
        "MonthlyCharges": Column(float, Check.ge(0), nullable=False),
        "TotalCharges": Column(float, Check.ge(0), nullable=True),
        "Contract": Column(str, nullable=True),
        "InternetService": Column(str, nullable=True),
        "TechSupport": Column(str, nullable=True),
        "PaymentMethod": Column(str, nullable=True),
    },
    strict=False,  # allow extra columns (e.g. Churn label)
)

fraud_schema = pa.DataFrameSchema(
    {
        "amount": Column(float, Check.ge(0), nullable=False),
        "hour_of_day": Column(int, [Check.ge(0), Check.le(23)], nullable=False),
        "day_of_week": Column(int, [Check.ge(0), Check.le(6)], nullable=False),
    },
    strict=False,
)

SCHEMAS = {
    "churn_model": churn_schema,
    "fraud_model": fraud_schema,
}


def validate_batch(
    df: pd.DataFrame, model_id: str = "churn_model"
) -> Tuple[pd.DataFrame, pd.DataFrame, float]:
    """
    Returns (clean_df, quarantined_df, rejection_rate).
    Row-level validation: a single bad value quarantines the whole row.
    The clean set is what gets passed to the drift detector.
    """
    schema = SCHEMAS.get(model_id, churn_schema)
    clean_rows, bad_rows = [], []

    for idx in df.index:
        try:
            schema.validate(df.loc[[idx]])
            clean_rows.append(idx)
        except pa.errors.SchemaError:
            bad_rows.append(idx)

    clean_df = df.loc[clean_rows].copy()
    quarantined_df = df.loc[bad_rows].copy()
    rejection_rate = len(bad_rows) / max(len(df), 1)

    return clean_df, quarantined_df, rejection_rate
