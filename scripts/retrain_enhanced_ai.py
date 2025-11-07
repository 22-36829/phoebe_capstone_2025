"""Automated retraining workflow for the enhanced AI assistant.

Steps:
1. Fetch aggregated AI metrics from the database (no raw chats stored).
2. Derive high-signal tokens to improve keyword overrides.
3. Update the synonym/override configuration file.
4. Regenerate sentence embeddings to keep inventory search fresh.
5. Run regression tests to ensure behaviour remains stable.
6. Trigger the backend cache refresh endpoint.

Configure via environment variables:
    DATABASE_URL                 - Postgres connection string (same as backend).
    AI_SYNONYM_CONFIG_PATH       - Path to the JSON synonym configuration file.
    AI_RETRAIN_LOOKBACK_DAYS     - Metrics lookback window (default 14 days).
    AI_RETRAIN_MIN_TOKEN_COUNT   - Minimum occurrences for a token to be considered (default 3).
    AI_REFRESH_ENDPOINT          - Optional HTTP endpoint to refresh cache after retrain.
    AI_METRICS_SERVICE_TOKEN     - Bearer token for the refresh endpoint if required.
    PYTHONPATH                   - Should include backend folder to import services.

This script is designed to be scheduler-friendly (cron, Task Scheduler, or CI job).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import numpy as np
import pandas as pd
import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

# Ensure backend package imports resolve when script executed from repo root
ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.enhanced_ai_service import EnhancedAIService  # noqa: E402

load_dotenv()


DEFAULT_LOOKBACK_DAYS = int(os.getenv("AI_RETRAIN_LOOKBACK_DAYS", "14"))
MIN_TOKEN_COUNT = int(os.getenv("AI_RETRAIN_MIN_TOKEN_COUNT", "3"))
CONFIG_PATH = Path(os.getenv(
    "AI_SYNONYM_CONFIG_PATH",
    BACKEND_DIR / "config" / "ai_synonyms.json",
))
REFRESH_ENDPOINT = os.getenv("AI_REFRESH_ENDPOINT")
REFRESH_TOKEN = os.getenv("AI_METRICS_SERVICE_TOKEN")
DATABASE_URL = os.getenv("DATABASE_URL")


@dataclass
class TokenSuggestion:
    token: str
    count: int
    product_matches: List[str]


def get_engine() -> Engine:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured")
    return create_engine(DATABASE_URL, pool_pre_ping=True)


def load_metrics(engine: Engine, lookback_days: int) -> pd.DataFrame:
    query = text(
        """
        SELECT metric_date,
               pharmacy_id,
               total_queries,
               no_match_queries,
               top_unmatched_tokens
        FROM public.ai_daily_metrics
        WHERE metric_date >= CURRENT_DATE - :window
        ORDER BY metric_date DESC
        """
    )
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params={"window": lookback_days})
    if df.empty:
        return df
    df["top_unmatched_tokens"] = df["top_unmatched_tokens"].apply(
        lambda value: value if isinstance(value, list) else json.loads(value or "[]")
    )
    return df


def aggregate_tokens(metrics_df: pd.DataFrame) -> Counter:
    counter: Counter = Counter()
    for _, row in metrics_df.iterrows():
        for token_entry in row["top_unmatched_tokens"]:
            token = token_entry.get("token")
            count = token_entry.get("count", 0)
            if not token or count < MIN_TOKEN_COUNT:
                continue
            counter[token] += int(count)
    return counter


def load_inventory_dataframe(engine: Engine) -> pd.DataFrame:
    query = text(
        """
        SELECT p.name, COALESCE(pc.name, 'OTHERS') AS category_name
        FROM products p
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        WHERE p.is_active = true
        """
    )
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)
    df["name_lower"] = df["name"].str.lower()
    return df


def match_tokens_to_products(tokens: Counter, inventory_df: pd.DataFrame) -> List[TokenSuggestion]:
    suggestions: List[TokenSuggestion] = []
    for token, count in tokens.most_common():
        matches = inventory_df[inventory_df["name_lower"].str.contains(token)]
        if matches.empty:
            continue
        product_names = sorted(set(matches["name"].tolist()))[:10]
        suggestions.append(TokenSuggestion(token=token, count=count, product_matches=product_names))
    return suggestions


def update_keyword_overrides(config: Dict[str, Any], suggestions: Sequence[TokenSuggestion]) -> bool:
    overrides: Dict[str, List[str]] = {
        token: list(names) for token, names in config.get("keyword_overrides", {}).items()
    }
    changed = False
    for suggestion in suggestions:
        current = overrides.get(suggestion.token, [])
        merged = sorted(set(current + suggestion.product_matches))[:10]
        if merged != current:
            overrides[suggestion.token] = merged
            changed = True
    if changed:
        config["keyword_overrides"] = overrides
    return changed


def regenerate_embeddings(service: EnhancedAIService) -> None:
    # Rebuild vectors so synonyms and overrides are reflected.
    service.refresh_inventory(force=True)


def run_tests() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "backend/tests/test_enhanced_ai_service.py"],
        cwd=ROOT_DIR,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("Regression tests failed; aborting retrain")


def trigger_refresh_endpoint() -> None:
    if not REFRESH_ENDPOINT:
        return
    headers = {}
    if REFRESH_TOKEN:
        headers["Authorization"] = f"Bearer {REFRESH_TOKEN}"
    response = requests.post(REFRESH_ENDPOINT, timeout=10, headers=headers)
    response.raise_for_status()


def main() -> None:
    lookback_days = DEFAULT_LOOKBACK_DAYS
    engine = get_engine()

    metrics_df = load_metrics(engine, lookback_days)
    if metrics_df.empty:
        print("No metrics available for retraining window; exiting gracefully.")
        return

    token_counts = aggregate_tokens(metrics_df)
    if not token_counts:
        print("No unmatched token signals detected; nothing to update.")
        return

    inventory_df = load_inventory_dataframe(engine)
    suggestions = match_tokens_to_products(token_counts, inventory_df)
    if not suggestions:
        print("Token suggestions did not map to inventory products; skipping update.")
        return

    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if CONFIG_PATH.exists():
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    else:
        config = {}

    if not update_keyword_overrides(config, suggestions):
        print("Keyword overrides already up to date; no changes required.")
    else:
        backup_path = CONFIG_PATH.with_suffix(f".{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.bak")
        if CONFIG_PATH.exists():
            CONFIG_PATH.replace(backup_path)
        CONFIG_PATH.write_text(json.dumps(config, indent=2), encoding="utf-8")
        print(f"Keyword overrides updated. Backup saved to {backup_path.name}.")

    service = EnhancedAIService(use_database=True)
    regenerate_embeddings(service)

    run_tests()

    trigger_refresh_endpoint()

    print("Retraining workflow completed successfully.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # pragma: no cover - scheduler logs error
        print(f"Retraining workflow failed: {exc}")
        sys.exit(1)

