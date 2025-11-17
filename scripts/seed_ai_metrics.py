"""
Utility script to seed ai_daily_metrics with sample data for retraining.
"""

import json
import os
from datetime import date, timedelta

from sqlalchemy import create_engine, text


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")

    engine = create_engine(url)
    rows = [
        {
            "metric_date": date.today().isoformat(),
            "pharmacy_id": 1,
            "total_queries": 42,
            "no_match_queries": 9,
            "positive_feedback": 15,
            "negative_feedback": 2,
            "avg_latency_ms": 820.5,
            "top_unmatched_categories": json.dumps(
                [
                    {"category": "blood_pressure", "count": 3},
                    {"category": "pain_relief", "count": 2},
                ]
            ),
            "top_unmatched_tokens": json.dumps(
                [
                    {"token": "amlodipine", "count": 4},
                    {"token": "biogesic", "count": 3},
                    {"token": "aspilet", "count": 2},
                    {"token": "ceelin", "count": 2},
                ]
            ),
        },
        {
            "metric_date": (date.today() - timedelta(days=1)).isoformat(),
            "pharmacy_id": 1,
            "total_queries": 37,
            "no_match_queries": 11,
            "positive_feedback": 11,
            "negative_feedback": 3,
            "avg_latency_ms": 910.2,
            "top_unmatched_categories": json.dumps(
                [
                    {"category": "vitamins", "count": 4},
                ]
            ),
            "top_unmatched_tokens": json.dumps(
                [
                    {"token": "amlodipine", "count": 5},
                    {"token": "ceelin", "count": 4},
                    {"token": "catapres", "count": 3},
                ]
            ),
        },
    ]

    stmt = text(
        """
        INSERT INTO public.ai_daily_metrics (
            metric_date,
            pharmacy_id,
            total_queries,
            no_match_queries,
            positive_feedback,
            negative_feedback,
            avg_latency_ms,
            top_unmatched_categories,
            top_unmatched_tokens
        ) VALUES (
            :metric_date,
            :pharmacy_id,
            :total_queries,
            :no_match_queries,
            :positive_feedback,
            :negative_feedback,
            :avg_latency_ms,
            :top_unmatched_categories,
            :top_unmatched_tokens
        )
        ON CONFLICT (metric_date, pharmacy_id) DO UPDATE SET
            total_queries = EXCLUDED.total_queries,
            no_match_queries = EXCLUDED.no_match_queries,
            positive_feedback = EXCLUDED.positive_feedback,
            negative_feedback = EXCLUDED.negative_feedback,
            avg_latency_ms = EXCLUDED.avg_latency_ms,
            top_unmatched_categories = EXCLUDED.top_unmatched_categories,
            top_unmatched_tokens = EXCLUDED.top_unmatched_tokens,
            updated_at = NOW();
        """
    )

    with engine.begin() as conn:
        conn.execute(stmt, rows)

    print(f"Seeded {len(rows)} ai_daily_metrics rows")


if __name__ == "__main__":
    main()

