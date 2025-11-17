"""
Simplified Model Training Script
Trains ARIMA, SARIMAX, and Prophet models
Compares accuracy and saves the best model
"""
import os
import sys
import time
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from forecasting_service import ForecastingService
from datetime import datetime

load_dotenv()

import sys
from pathlib import Path

# Add parent directory to path to import utils
sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils.helpers import get_database_url

DATABASE_URL = get_database_url()

def get_products_for_pharmacy(engine, pharmacy_id, limit=50):
    """Get active products for a pharmacy (sorted by sales, limited)"""
    with engine.connect() as conn:
        has_sales_table = conn.execute(text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = 'historical_sales_daily'
            )
        """)).scalar()

        if has_sales_table:
            query = text("""
                SELECT DISTINCT 
                    p.id, 
                    p.name, 
                    COALESCE(pc.name, '') AS category_name,
                    COALESCE(hsd.avg_daily_sales, 0) AS avg_daily_sales
                FROM products p
                LEFT JOIN product_categories pc ON pc.id = p.category_id
                LEFT JOIN (
                    SELECT 
                        product_id,
                        AVG(quantity_sold) AS avg_daily_sales,
                        COUNT(DISTINCT sale_date) AS sales_days
                    FROM historical_sales_daily
                    WHERE pharmacy_id = :ph
                    GROUP BY product_id
                ) hsd ON hsd.product_id = p.id
                WHERE p.pharmacy_id = :ph AND p.is_active = true
                ORDER BY COALESCE(hsd.avg_daily_sales, 0) DESC, p.name ASC
                LIMIT :limit
            """)
        else:
            query = text("""
                SELECT DISTINCT 
                    p.id, 
                    p.name, 
                    COALESCE(pc.name, '') AS category_name,
                    0::numeric AS avg_daily_sales
                FROM products p
                LEFT JOIN product_categories pc ON pc.id = p.category_id
                WHERE p.pharmacy_id = :ph AND p.is_active = true
                ORDER BY p.name ASC
                LIMIT :limit
            """)

        products = conn.execute(query, {'ph': pharmacy_id, 'limit': limit}).mappings().all()

    return [dict(p) for p in products]

def get_all_pharmacies(engine):
    """Get all pharmacies"""
    with engine.connect() as conn:
        pharmacies = conn.execute(
            text("SELECT id, name FROM pharmacies ORDER BY id")
        ).mappings().all()
    return [dict(p) for p in pharmacies]

def train_product_model(service, pharmacy_id, product_id, product_name, days=365, current_index=0, total=0):
    """Train models for a product and compare accuracy"""
    progress = f"[{current_index}/{total}] " if total > 0 else ""
    print(f"\n{progress}Training models for: {product_name} (ID: {product_id})...", end='', flush=True)
    
    start_time = time.time()
    try:
        result, message = service.train_and_compare_models(
            pharmacy_id=pharmacy_id,
            target_id=product_id,
            target_name=product_name,
            model_type='product',
            days=days
        )
        
        elapsed = time.time() - start_time
        
        if result is None:
            print(f" [FAILED] {message} ({elapsed:.1f}s)")
            return False
        
        metrics = result.get('metrics', {})
        comparison = result.get('comparison', {})
        mape_value = metrics.get('mape')
        mape_str = f" | MAPE: {mape_value:.2f}%" if isinstance(mape_value, (int, float)) else ""
        
        # Print comparison - show all models that were compared
        print(
            f" [SUCCESS] Best: {result['model_type'].upper()} | "
            f"Accuracy: {metrics.get('accuracy', 0):.2f}% | "
            f"MAE: {metrics.get('mae', 0):.4f}{mape_str} "
            f"({elapsed:.1f}s)"
        )
        if comparison:
            print(f"           Comparison:", end=' ')
            # Show in order: SARIMAX, PROPHET
            model_order = ['sarimax', 'prophet']
            for model_type in model_order:
                if model_type in comparison:
                    print(f"{model_type.upper()}: {comparison[model_type]['accuracy']:.2f}%", end=' ')
            # Show any other models
            for model_type, m in comparison.items():
                if model_type not in model_order:
                    print(f"{model_type.upper()}: {m['accuracy']:.2f}%", end=' ')
            print()
        else:
            print(f"           (Only {result['model_type'].upper()} model succeeded)")
        
        return True
        
    except Exception as e:
        elapsed = time.time() - start_time
        print(f" [ERROR] {str(e)} ({elapsed:.1f}s)")
        import traceback
        traceback.print_exc()
        return False

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Train forecasting models (SARIMAX, Prophet)')
    parser.add_argument('--pharmacy_id', type=int, help='Pharmacy ID to train models for')
    parser.add_argument('--product_id', type=int, help='Specific product ID to train (optional)')
    parser.add_argument('--all', action='store_true', help='Train models for all pharmacies')
    parser.add_argument('--days', type=int, default=365, help='Number of days of historical data to use (default: 365)')
    
    args = parser.parse_args()
    
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    service = ForecastingService(DATABASE_URL)
    
    print(f"\n{'='*60}")
    print(f"SIMPLIFIED FORECASTING MODEL TRAINING")
    print(f"{'='*60}")
    print(f"Models: SARIMAX, FBProphet")
    print(f"Method: Compare all models, select best based on accuracy")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Days of historical data: {args.days}")
    print(f"{'='*60}\n")
    
    success_count = 0
    fail_count = 0
    start_time = time.time()
    
    try:
        if args.all:
            # Train for all pharmacies
            pharmacies = get_all_pharmacies(engine)
            print(f"Found {len(pharmacies)} pharmacies\n")
            
            for pharmacy in pharmacies:
                print(f"\n{'#'*60}")
                print(f"Processing Pharmacy: {pharmacy['name']} (ID: {pharmacy['id']})")
                print(f"{'#'*60}")
                
                products = get_products_for_pharmacy(engine, pharmacy['id'])
                print(f"Loaded top {len(products)} products (sorted by sales)\n")
                
                total_products = len(products)
                print(f"Starting training for {total_products} products...\n")
                for idx, product in enumerate(products, 1):
                    if train_product_model(service, pharmacy['id'], product['id'], product['name'], args.days, idx, total_products):
                        success_count += 1
                    else:
                        fail_count += 1
                        
        elif args.pharmacy_id:
            # Train for specific pharmacy
            products = get_products_for_pharmacy(engine, args.pharmacy_id)
            total_products = len(products)
            print(f"Loaded top {total_products} products (sorted by sales) in pharmacy {args.pharmacy_id}\n")
            
            if args.product_id:
                # Train specific product
                product = next((p for p in products if p['id'] == args.product_id), None)
                if product:
                    if train_product_model(service, args.pharmacy_id, product['id'], product['name'], args.days, 1, 1):
                        success_count += 1
                    else:
                        fail_count += 1
                else:
                    print(f"[ERROR] Product ID {args.product_id} not found in pharmacy {args.pharmacy_id}")
                    fail_count += 1
            else:
                # Train all products in pharmacy
                print(f"Starting training for {total_products} products...\n")
                for idx, product in enumerate(products, 1):
                    if train_product_model(service, args.pharmacy_id, product['id'], product['name'], args.days, idx, total_products):
                        success_count += 1
                    else:
                        fail_count += 1
        else:
            print("[ERROR] Must specify --pharmacy_id or --all")
            parser.print_help()
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n\n[WARNING] Training interrupted by user")
    except Exception as e:
        print(f"\n[FATAL ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # Summary
    total_elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"TRAINING SUMMARY")
    print(f"{'='*60}")
    print(f"[SUCCESS] Successful: {success_count}")
    print(f"[FAILED] Failed: {fail_count}")
    print(f"Total: {success_count + fail_count}")
    print(f"Total Time: {total_elapsed:.1f} seconds ({total_elapsed/60:.1f} minutes)")
    if success_count > 0:
        print(f"Average Time per Product: {total_elapsed/success_count:.1f} seconds")
    print(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

if __name__ == '__main__':
    main()

