#!/usr/bin/env python
"""
Generate dummy daily sales from November 8 up to today for the top-N products
of a pharmacy, persist them in the database, and optionally retrain the
forecasting models afterwards.
"""
from __future__ import annotations

import argparse
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

load_dotenv()

from train_models import get_products_for_pharmacy  # type: ignore  # noqa: E402
from utils.helpers import get_database_url  # type: ignore  # noqa: E402

try:
    from tqdm import tqdm
except ImportError:  # pragma: no cover
    tqdm = None


MS_IN_DAY = 24 * 60 * 60 * 1000


def normalize_date(value: datetime | None) -> datetime:
    dt = value or datetime.now(timezone.utc)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)


def get_latest_nov8(reference: datetime | None = None) -> datetime:
    date = normalize_date(reference)
    year = date.year if date.month >= 11 else date.year - 1
    return datetime(year, 11, 8, tzinfo=timezone.utc)


def deterministic_random(seed_input: int) -> Iterable[float]:
    seed = abs(int(seed_input)) % 2147483647
    if seed == 0:
        seed = 2147483646
    while True:
        seed = (seed * 16807) % 2147483647
        yield (seed - 1) / 2147483646


def generate_series(
    product: Dict,
    start_date: datetime,
    end_date: datetime,
) -> List[Tuple[datetime, int]]:
    avg_sales = max(1, float(product.get("avg_daily_sales") or 5))
    unit_price = float(product.get("unit_price") or 50)
    cost_price = float(product.get("cost_price") or max(unit_price * 0.6, 1))
    profit_per_unit = unit_price - cost_price

    total_days = int((end_date - start_date).days) + 1
    rand_stream = deterministic_random(int(product.get("id") or round(avg_sales * 17)))
    series: List[Tuple[datetime, int]] = []
    for i in range(total_days):
        current_date = start_date + timedelta(days=i)
        weekly = 0.08 * math.sin((i % 7) / 7 * math.pi * 2)
        noise = (next(rand_stream) - 0.5) * 0.25
        growth = 1 + (i / total_days) * 0.03
        sales = max(0, round(avg_sales * (1 + weekly + noise) * growth))

        # Ensure at least one unit occasionally to avoid all-zero windows
        if sales == 0 and i % 10 == 0:
            sales = 1

        series.append((current_date, sales))
    return series


def ensure_historical_table(engine: Engine) -> None:
    ddl = """
        CREATE TABLE IF NOT EXISTS historical_sales_daily (
            id bigserial primary key,
            pharmacy_id bigint not null references pharmacies(id) on delete cascade,
            product_id bigint not null references products(id) on delete cascade,
            sale_date date not null,
            quantity_sold numeric(12,2) not null default 0,
            created_at timestamptz default now(),
            updated_at timestamptz default now(),
            unique (pharmacy_id, product_id, sale_date)
        );
    """
    with engine.begin() as conn:
        conn.execute(text(ddl))
        conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_hsd_ph_prod_date
                ON historical_sales_daily (pharmacy_id, product_id, sale_date);
                """
            )
        )


def get_table_columns(engine: Engine, table_name: str) -> Sequence[str]:
    query = text(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :table
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query, {"table": table_name}).fetchall()
    return [row[0] for row in rows]


def get_table_column_details(engine: Engine, table_name: str) -> List[Dict[str, str]]:
    query = text(
        """
        SELECT column_name, is_generated
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :table
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query, {"table": table_name}).fetchall()
    return [{"name": row[0], "is_generated": row[1]} for row in rows]


class ProgressReporter:
    def __init__(self, total: int, desc: str):
        self.total = total
        self.desc = desc
        self.count = 0
        self._bar = tqdm(total=total, desc=desc, unit="product") if tqdm else None
        if not self._bar:
            print(f"{desc}: 0/{total}")

    def update(self, step: int = 1):
        self.count += step
        if self._bar:
            self._bar.update(step)
        else:
            print(f"{self.desc}: {self.count}/{self.total}")

    def close(self):
        if self._bar:
            self._bar.close()


def delete_existing_dummy_sales(
    engine: Engine,
    pharmacy_id: int,
    start_date: datetime,
    end_date: datetime,
) -> None:
    prefix = f"DUMMY-{pharmacy_id}-%"
    with engine.begin() as conn:
        sale_ids = conn.execute(
            text(
                """
                SELECT id FROM sales
                WHERE pharmacy_id = :ph
                  AND sale_number LIKE :prefix
                  AND created_at BETWEEN :start AND :end
                """
            ),
            {
                "ph": pharmacy_id,
                "prefix": prefix,
                "start": start_date,
                "end": end_date + timedelta(days=1),
            },
        ).fetchall()
        if sale_ids:
            id_list = [row[0] for row in sale_ids]
            conn.execute(
                text(
                    """
                    DELETE FROM sale_items WHERE sale_id = ANY(:ids)
                    """
                ),
                {"ids": id_list},
            )
            conn.execute(
                text(
                    """
                    DELETE FROM sales WHERE id = ANY(:ids)
                    """
                ),
                {"ids": id_list},
            )


def seed_historical_sales(
    engine: Engine,
    pharmacy_id: int,
    product_series: Dict[int, List[Tuple[datetime, int]]],
    progress: Optional[ProgressReporter] = None,
) -> int:
    hist_columns = set(get_table_columns(engine, "historical_sales_daily"))
    include_created = "created_at" in hist_columns
    include_updated = "updated_at" in hist_columns

    insert_cols = ["pharmacy_id", "product_id", "sale_date", "quantity_sold"]
    values_expr = [":pharmacy_id", ":product_id", ":sale_date", ":quantity_sold"]
    if include_created:
        insert_cols.append("created_at")
        values_expr.append("now()")
    if include_updated:
        insert_cols.append("updated_at")
        values_expr.append("now()")

    insert_sql = text(
        f"""
        INSERT INTO historical_sales_daily (
            {', '.join(insert_cols)}
        )
        VALUES ({', '.join(values_expr)});
        """
    )
    delete_sql = text(
        """
        DELETE FROM historical_sales_daily
        WHERE pharmacy_id = :pharmacy_id
          AND product_id = :product_id
          AND sale_date = :sale_date;
        """
    )
    rows = 0
    with engine.begin() as conn:
        for idx, (product_id, series) in enumerate(product_series.items(), 1):
            for current_date, quantity in series:
                params = {
                    "pharmacy_id": pharmacy_id,
                    "product_id": product_id,
                    "sale_date": current_date.date(),
                    "quantity_sold": float(quantity),
                }
                conn.execute(delete_sql, params)
                conn.execute(
                    insert_sql,
                    params,
                )
                rows += 1
            if progress:
                progress.update()
    if progress:
        progress.close()
    return rows


def pick_user_id(engine: Engine, pharmacy_id: int) -> int:
    query = text(
        """
        SELECT id
        FROM users
        WHERE pharmacy_id = :ph
        ORDER BY
            CASE
                WHEN role = 'manager' THEN 1
                WHEN role = 'staff' THEN 2
                WHEN role = 'admin' THEN 3
                ELSE 4
            END,
            id
        LIMIT 1
        """
    )
    with engine.connect() as conn:
        row = conn.execute(query, {"ph": pharmacy_id}).fetchone()
        if not row:
            raise RuntimeError(
                f"No user found for pharmacy {pharmacy_id}. "
                "Cannot insert dummy sales without a user_id."
            )
        return int(row[0])


def seed_recent_sales(
    engine: Engine,
    pharmacy_id: int,
    user_id: int,
    product_series: Dict[int, List[Tuple[datetime, int]]],
    products_lookup: Dict[int, Dict],
    recent_cutoff: datetime,
    progress: Optional[ProgressReporter] = None,
) -> int:
    sales_details = get_table_column_details(engine, "sales")
    sales_columns = {col["name"] for col in sales_details}
    generated_sales_cols = {
        col["name"] for col in sales_details if col["is_generated"] == "ALWAYS"
    }

    item_details = get_table_column_details(engine, "sale_items")
    item_columns = {col["name"] for col in item_details}
    generated_item_cols = {
        col["name"] for col in item_details if col["is_generated"] == "ALWAYS"
    }

    required_sale_cols = {
        "sale_number",
        "pharmacy_id",
        "user_id",
        "subtotal",
        "tax_amount",
        "discount_amount",
        "payment_method",
        "status",
        "notes",
        "created_at",
    }
    missing = required_sale_cols - sales_columns
    if missing:
        raise RuntimeError(f"'sales' table missing required columns: {', '.join(missing)}")

    include_total = "total_amount" in sales_columns and "total_amount" not in generated_sales_cols
    include_updated = "updated_at" in sales_columns

    insert_sales_cols = [
        "sale_number",
        "pharmacy_id",
        "user_id",
        "subtotal",
        "tax_amount",
        "discount_amount",
        "payment_method",
        "status",
        "notes",
        "created_at",
    ]
    if include_total:
        insert_sales_cols.append("total_amount")
    if include_updated:
        insert_sales_cols.append("updated_at")

    sales_sql = text(
        f"""
        INSERT INTO sales ({', '.join(insert_sales_cols)})
        VALUES ({', '.join(':'+c for c in insert_sales_cols)})
        RETURNING id
        """
    )

    required_item_cols = {"sale_id", "product_id", "quantity", "unit_price"}
    if not required_item_cols.issubset(item_columns):
        raise RuntimeError(
            f"'sale_items' table missing required columns: "
            f"{', '.join(required_item_cols - item_columns)}"
        )
    include_total_price = "total_price" in item_columns and "total_price" not in generated_item_cols
    include_item_created = "created_at" in item_columns

    item_cols = ["sale_id", "product_id", "quantity", "unit_price"]
    if include_total_price:
        item_cols.append("total_price")
    if include_item_created:
        item_cols.append("created_at")

    sale_items_sql = text(
        f"""
        INSERT INTO sale_items ({', '.join(item_cols)})
        VALUES ({', '.join(':'+c for c in item_cols)})
        """
    )

    inserted = 0
    tz_now = datetime.now(timezone.utc)

    with engine.begin() as conn:
        for idx, (product_id, series) in enumerate(product_series.items(), 1):
            product = products_lookup[product_id]
            unit_price = float(product.get("unit_price") or 50)
            for current_date, quantity in series:
                if current_date < recent_cutoff or quantity <= 0:
                    continue
                sale_number = (
                    f"DUMMY-{pharmacy_id}-{product_id}-{current_date.strftime('%Y%m%d')}"
                )
                subtotal = unit_price * quantity
                tax_amount = subtotal * 0.12
                discount_amount = 0.0
                total_amount = subtotal + tax_amount - discount_amount
                created_at = datetime(
                    current_date.year,
                    current_date.month,
                    current_date.day,
                    12,
                    0,
                    tzinfo=timezone.utc,
                )

                sales_payload = {
                    "sale_number": sale_number,
                    "pharmacy_id": pharmacy_id,
                    "user_id": user_id,
                    "subtotal": subtotal,
                    "tax_amount": tax_amount,
                    "discount_amount": discount_amount,
                    "payment_method": "cash",
                    "status": "completed",
                    "notes": "[DUMMY_RECENT_SALES]",
                    "created_at": created_at,
                }
                if include_total:
                    sales_payload["total_amount"] = total_amount
                if include_updated:
                    sales_payload["updated_at"] = tz_now

                sale_id = conn.execute(sales_sql, sales_payload).scalar_one()

                item_payload = {
                    "sale_id": sale_id,
                    "product_id": product_id,
                    "quantity": quantity,
                    "unit_price": unit_price,
                }
                if include_total_price:
                    item_payload["total_price"] = subtotal
                if include_item_created:
                    item_payload["created_at"] = created_at

                conn.execute(sale_items_sql, item_payload)
                inserted += 1
            if progress:
                progress.update()
    if progress:
        progress.close()
    return inserted


def retrain_models(pharmacy_id: int, limit: int, days: int) -> None:
    from retrain_forecasting_models import retrain_products  # type: ignore

    retrain_products(
        pharmacy_id=pharmacy_id,
        product_id=None,
        limit=limit,
        days=days,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed dummy recent sales for top products and retrain models.",
    )
    parser.add_argument(
        "--pharmacy-id",
        type=int,
        required=True,
        help="Pharmacy ID to seed.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="How many products to include (default 50).",
    )
    parser.add_argument(
        "--skip-retrain",
        action="store_true",
        help="Skip triggering model retraining after seeding data.",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=365,
        help="Historical window for retraining (default 365).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    pharmacy_id = args.pharmacy_id
    limit = max(1, args.limit)

    db_url = get_database_url()
    engine = create_engine(db_url, pool_pre_ping=True)

    ensure_historical_table(engine)

    today = normalize_date(datetime.now(timezone.utc))
    start_date = get_latest_nov8(today)
    recent_cutoff = today - timedelta(days=30)

    products = get_products_for_pharmacy(engine, pharmacy_id, limit=limit)
    if not products:
        raise RuntimeError(f"No products found for pharmacy {pharmacy_id}")

    print(
        f"Seeding dummy sales for pharmacy {pharmacy_id} "
        f"({len(products)} products) from {start_date.date()} to {today.date()}."
    )

    product_series: Dict[int, List[Tuple[datetime, int]]] = {}
    for product in products:
        pid = int(product["id"])
        series = generate_series(product, start_date, today)
        product_series[pid] = series

    products_lookup = {int(p["id"]): p for p in products}

    hist_progress = ProgressReporter(len(product_series), "Historical")
    seeded_hist = seed_historical_sales(
        engine,
        pharmacy_id,
        product_series,
        progress=hist_progress,
    )

    delete_existing_dummy_sales(engine, pharmacy_id, start_date, today)
    user_id = pick_user_id(engine, pharmacy_id)
    recent_progress = ProgressReporter(len(product_series), "Recent")
    seeded_recent = seed_recent_sales(
        engine,
        pharmacy_id,
        user_id,
        product_series,
        products_lookup,
        recent_cutoff,
        progress=recent_progress,
    )

    print(
        f"Seeded {seeded_hist} historical day rows "
        f"and {seeded_recent} recent sale entries for pharmacy {pharmacy_id}."
    )

    if not args.skip_retrain:
        retrain_models(pharmacy_id, limit=limit, days=args.days)


if __name__ == "__main__":
    main()

