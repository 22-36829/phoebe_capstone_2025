#!/usr/bin/env python
"""
Utility script to retrain the forecasting models used by the manager dashboard.

By default it retrains the latest 50 active products for a pharmacy by calling
the same ForecastingService that powers the API. Use --product-id to focus on a
single product.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"

# Ensure backend modules are importable
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

load_dotenv()

from forecasting_service import ForecastingService  # type: ignore  # noqa: E402
from train_models import (  # type: ignore  # noqa: E402
    get_products_for_pharmacy,
)
from utils.helpers import get_database_url  # type: ignore  # noqa: E402


def retrain_products(
    pharmacy_id: int,
    product_id: int | None,
    limit: int,
    days: int,
) -> None:
    """Retrain forecasting models and print a friendly summary."""
    db_url = get_database_url()
    engine = create_engine(db_url, pool_pre_ping=True)
    service = ForecastingService(db_url)

    products = get_products_for_pharmacy(engine, pharmacy_id, limit=limit)
    if product_id is not None:
        products = [p for p in products if int(p["id"]) == int(product_id)]
        limit = len(products)

    if not products:
        print("No products found for the given selection.")
        return

    print(
        f"Retraining forecasting models for {len(products)} product(s) "
        f"in pharmacy {pharmacy_id} using the last {days} day(s) of data.\n"
    )

    successes = 0
    failures = 0
    start = time.time()

    for idx, product in enumerate(products, 1):
        product_name = product.get("name", f"Product {product['id']}")
        label = f"[{idx}/{len(products)}] {product_name} (ID: {product['id']})"
        print(f"{label}: training...", end="")
        try:
            result, message = service.train_and_compare_models(
                pharmacy_id=pharmacy_id,
                target_id=int(product["id"]),
                target_name=product_name,
                model_type="product",
                days=days,
            )
            if result is None:
                failures += 1
                print(f" failed — {message}")
            else:
                successes += 1
                metrics = result.get("metrics", {})
                acc = metrics.get("accuracy")
                mae = metrics.get("mae")
                rmse = metrics.get("rmse")
                mape = metrics.get("mape")
                mape_str = f" mape={mape:.2f}%" if isinstance(mape, (int, float)) else ""
                print(
                    " done "
                    f"(best={result.get('model_type','?').upper()}, "
                    f"accuracy={acc:.2f}% mae={mae:.4f} rmse={rmse:.4f}{mape_str})"
                )
        except Exception as exc:  # pragma: no cover - CLI diagnostics
            failures += 1
            print(f" error — {exc}")

    duration = time.time() - start
    print("\nSummary")
    print("-------")
    print(f"Successful trainings: {successes}")
    print(f"Failed trainings    : {failures}")
    print(f"Elapsed time        : {duration:.1f}s (~{duration/60:.1f} min)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Retrain forecasting models for top products in a pharmacy.",
    )
    parser.add_argument(
        "--pharmacy-id",
        type=int,
        required=True,
        help="Pharmacy ID to retrain models for.",
    )
    parser.add_argument(
        "--product-id",
        type=int,
        help="Specific product ID (optional). Overrides --limit.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="How many top-selling products to retrain (default: 50).",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=365,
        help="Historical window length for model training (default: 365).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    retrain_products(
        pharmacy_id=args.pharmacy_id,
        product_id=args.product_id,
        limit=max(1, args.limit),
        days=max(30, args.days),
    )


if __name__ == "__main__":
    main()

