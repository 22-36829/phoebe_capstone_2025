"""Database schema initialization functions"""
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os

load_dotenv()
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require')
engine = create_engine(DATABASE_URL, pool_pre_ping=True)


def ensure_returns_tables() -> None:
	"""Ensure returns and return_items tables exist"""
	try:
		with engine.begin() as conn:
			# Create returns table
			conn.execute(text("""
				CREATE TABLE IF NOT EXISTS returns (
					id bigserial primary key,
					return_number text unique not null,
					sale_id bigint not null references sales(id) on delete cascade,
					pharmacy_id bigint not null references pharmacies(id) on delete cascade,
					user_id bigint references users(id) on delete set null,
					reason text not null,
					total_refund_amount numeric(12,2) not null check (total_refund_amount >= 0),
					status text default 'completed' check (status in ('pending', 'completed', 'cancelled')),
					notes text,
					created_at timestamptz default now(),
					updated_at timestamptz default now()
				)
			"""))
			
			# Create return_items table
			conn.execute(text("""
				CREATE TABLE IF NOT EXISTS return_items (
					id bigserial primary key,
					return_id bigint references returns(id) on delete cascade,
					product_id bigint references products(id),
					quantity int not null check (quantity > 0),
					unit_price numeric(12,2) not null check (unit_price >= 0),
					total_refund numeric(12,2) generated always as (quantity * unit_price) stored,
					created_at timestamptz default now()
				)
			"""))
			
			# Create triggers for updated_at
			conn.execute(text("""
				DROP TRIGGER IF EXISTS trg_returns_updated ON returns;
				CREATE TRIGGER trg_returns_updated 
				BEFORE UPDATE ON returns 
				FOR EACH ROW EXECUTE FUNCTION set_updated_at();
			"""))
	except Exception as e:
		print(f"Error creating returns tables: {e}")


def ensure_pharmacy_signup_requests_table() -> None:
	try:
		with engine.begin() as conn:
			conn.execute(text("""
				CREATE TABLE IF NOT EXISTS pharmacy_signup_requests (
					id bigserial primary key,
					pharmacy_name text not null,
					email text not null,
					owner_name text default '',
					password_hash text not null,
					status text not null default 'pending',
					admin_notes text default '',
					created_at timestamptz default now(),
					updated_at timestamptz default now()
				)
			"""))
			conn.execute(text("""
				DROP TRIGGER IF EXISTS trg_ph_signup_updated ON pharmacy_signup_requests;
				CREATE TRIGGER trg_ph_signup_updated 
				BEFORE UPDATE ON pharmacy_signup_requests 
				FOR EACH ROW EXECUTE FUNCTION set_updated_at();
			"""))
	except Exception as e:
		print(f"[ensure_pharmacy_signup_requests_table] Error: {e}")


def ensure_inventory_requests_table() -> None:
	try:
		with engine.begin() as conn:
			conn.execute(text("""
				create table if not exists inventory_adjustment_requests (
					id bigserial primary key,
					pharmacy_id bigint not null references pharmacies(id) on delete cascade,
					product_id bigint not null references products(id) on delete cascade,
					requested_by bigint not null references users(id) on delete set null,
					approved_by bigint references users(id) on delete set null,
					quantity_change int not null,
					reason text,
					status text not null default 'pending',
					created_at timestamptz default now(),
					decided_at timestamptz
				);
				create index if not exists idx_inv_req_pharmacy on inventory_adjustment_requests(pharmacy_id);
				create index if not exists idx_inv_req_status on inventory_adjustment_requests(status);
			"""))
	except Exception as e:
		print(f"[ensure_inventory_requests_table] Error: {e}")


def ensure_products_location_column() -> None:
	try:
		with engine.begin() as conn:
			conn.execute(text("""
				do $$ begin
					if not exists (
						select 1 from information_schema.columns
						where table_name='products' and column_name='location'
					) then
						alter table products add column location text;
					end if;
				end $$;
			"""))
	except Exception as e:
		print(f"[ensure_products_location_column] Error: {e}")


def ensure_pharmacy_deletion_requests_table() -> None:
	try:
		with engine.begin() as conn:
			conn.execute(text("""
				create table if not exists pharmacy_deletion_requests (
					id bigserial primary key,
					pharmacy_id bigint not null references pharmacies(id) on delete cascade,
					requested_by bigint not null references users(id) on delete set null,
					reason text,
					status text not null default 'pending',
					created_at timestamptz default now()
				);
				create index if not exists idx_ph_del_req_pharmacy on pharmacy_deletion_requests(pharmacy_id);
				create index if not exists idx_ph_del_req_status on pharmacy_deletion_requests(status);
			"""))
	except Exception as e:
		print(f"[ensure_pharmacy_deletion_requests_table] Error: {e}")


def ensure_inventory_expiration_column() -> None:
	try:
		with engine.begin() as conn:
			conn.execute(text("""
				do $$ begin
					if not exists (
						select 1 from information_schema.columns
						where table_name='inventory' and column_name='expiration_date'
					) then
						alter table inventory add column expiration_date date;
					end if;
				end $$;
			"""))
	except Exception as e:
		print(f"[ensure_inventory_expiration_column] Error: {e}")


def ensure_products_reorder_supplier_columns() -> None:
	try:
		with engine.begin() as conn:
			conn.execute(text("""
				do $$ begin
					if not exists (
						select 1 from information_schema.columns
						where table_name='products' and column_name='reorder_point'
					) then
						alter table products add column reorder_point integer default 0;
					end if;
					if not exists (
						select 1 from information_schema.columns
						where table_name='products' and column_name='preferred_supplier_id'
					) then
						alter table products add column preferred_supplier_id bigint references suppliers(id);
					end if;
				end $$;
			"""))
	except Exception as e:
		print(f"[ensure_products_reorder_supplier_columns] Error: {e}")


def ensure_set_updated_at_function() -> None:
	"""Ensure set_updated_at trigger function exists"""
	try:
		with engine.begin() as conn:
			conn.execute(text("""
				CREATE OR REPLACE FUNCTION set_updated_at()
				RETURNS TRIGGER LANGUAGE plpgsql AS $$
				BEGIN
					NEW.updated_at = NOW();
					RETURN NEW;
				END $$;
			"""))
	except Exception as e:
		print(f"[ensure_set_updated_at_function] Error: {e}")


def ensure_support_tickets_tables() -> None:
	"""Ensure support tickets and messages tables exist"""
	try:
		with engine.begin() as conn:
			# Create support_tickets table
			conn.execute(text("""
				CREATE TABLE IF NOT EXISTS support_tickets (
					id bigserial primary key,
					ticket_number text unique not null,
					pharmacy_id bigint not null references pharmacies(id) on delete cascade,
					created_by bigint not null references users(id) on delete set null,
					assigned_to bigint references users(id) on delete set null,
					type text not null check (type in ('support', 'feature_request', 'bug_report')),
					subject text not null,
					description text,
					status text default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
					priority text default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
					created_at timestamptz default now(),
					updated_at timestamptz default now(),
					resolved_at timestamptz,
					resolved_by bigint references users(id) on delete set null,
					closed_at timestamptz,
					closed_by bigint references users(id) on delete set null
				)
			"""))
			
			# Create support_ticket_messages table
			conn.execute(text("""
				CREATE TABLE IF NOT EXISTS support_ticket_messages (
					id bigserial primary key,
					ticket_id bigint not null references support_tickets(id) on delete cascade,
					user_id bigint not null references users(id) on delete set null,
					message text not null,
					attachments jsonb default '[]'::jsonb,
					created_at timestamptz default now(),
					is_internal boolean default false,
					read_at timestamptz
				)
			"""))
			
			# Create indexes for better performance
			conn.execute(text("""
				CREATE INDEX IF NOT EXISTS idx_support_tickets_pharmacy 
				ON support_tickets(pharmacy_id)
			"""))
			conn.execute(text("""
				CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by 
				ON support_tickets(created_by)
			"""))
			conn.execute(text("""
				CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to 
				ON support_tickets(assigned_to)
			"""))
			conn.execute(text("""
				CREATE INDEX IF NOT EXISTS idx_support_tickets_status 
				ON support_tickets(status)
			"""))
			conn.execute(text("""
				CREATE INDEX IF NOT EXISTS idx_support_tickets_type 
				ON support_tickets(type)
			"""))
			conn.execute(text("""
				CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at 
				ON support_tickets(created_at DESC)
			"""))
			conn.execute(text("""
				CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket 
				ON support_ticket_messages(ticket_id)
			"""))
			conn.execute(text("""
				CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_user 
				ON support_ticket_messages(user_id)
			"""))
			conn.execute(text("""
				CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_created_at 
				ON support_ticket_messages(created_at)
			"""))
			
			# Create trigger function for updated_at
			conn.execute(text("""
				CREATE OR REPLACE FUNCTION update_support_ticket_updated_at()
				RETURNS TRIGGER AS $$
				BEGIN
					UPDATE support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
					RETURN NEW;
				END;
				$$ LANGUAGE plpgsql
			"""))
			
			# Create trigger for ticket messages
			conn.execute(text("""
				DROP TRIGGER IF EXISTS trg_support_ticket_messages_updated ON support_ticket_messages;
				CREATE TRIGGER trg_support_ticket_messages_updated
					AFTER INSERT ON support_ticket_messages
					FOR EACH ROW
					EXECUTE FUNCTION update_support_ticket_updated_at()
			"""))
			
			# Create trigger for ticket updates
			conn.execute(text("""
				DROP TRIGGER IF EXISTS trg_support_tickets_updated ON support_tickets;
				CREATE TRIGGER trg_support_tickets_updated
					BEFORE UPDATE ON support_tickets
					FOR EACH ROW
					EXECUTE FUNCTION set_updated_at()
			"""))
	except Exception as e:
		print(f"[ensure_support_tickets_tables] Error: {e}")


def ensure_announcements_table() -> None:
	"""Ensure announcements table exists"""
	try:
		with engine.begin() as conn:
			# Create announcements table
			conn.execute(text("""
				CREATE TABLE IF NOT EXISTS announcements (
					id bigserial primary key,
					title text not null,
					content text not null,
					type text default 'info' check (type in ('info', 'warning', 'urgent', 'update')),
					is_pinned boolean default false,
					is_active boolean default true,
					created_by bigint not null references users(id) on delete set null,
					created_at timestamptz default now(),
					updated_at timestamptz default now(),
					expires_at timestamptz
				)
			"""))
			
			# Create indexes
			conn.execute(text("""
				CREATE INDEX IF NOT EXISTS idx_announcements_is_active 
				ON announcements(is_active, created_at DESC)
			"""))
			conn.execute(text("""
				CREATE INDEX IF NOT EXISTS idx_announcements_is_pinned 
				ON announcements(is_pinned, created_at DESC)
			"""))
			conn.execute(text("""
				CREATE INDEX IF NOT EXISTS idx_announcements_created_at 
				ON announcements(created_at DESC)
			"""))
			
			# Create trigger for updated_at
			conn.execute(text("""
				DROP TRIGGER IF EXISTS trg_announcements_updated ON announcements;
				CREATE TRIGGER trg_announcements_updated
					BEFORE UPDATE ON announcements
					FOR EACH ROW
					EXECUTE FUNCTION set_updated_at()
			"""))
	except Exception as e:
		print(f"[ensure_announcements_table] Error: {e}")


def ensure_subscription_plans_table():
	"""Ensure subscription_plans table exists with default pricing"""
	try:
		with engine.begin() as conn:
			# Create table if not exists
			conn.execute(text('''
				create table if not exists subscription_plans (
					id serial primary key,
					plan_name varchar(50) unique not null,
					monthly_price numeric(12, 2) not null,
					quarterly_price numeric(12, 2),
					semi_annual_price numeric(12, 2),
					annual_price numeric(12, 2),
					is_active boolean default true,
					created_at timestamp default now(),
					updated_at timestamp default now()
				)
			'''))
			
			# Insert default plans if they don't exist
			existing = conn.execute(text('select plan_name from subscription_plans')).mappings().all()
			existing_names = {row['plan_name'] for row in existing}
			
			default_plans = [
				('Free Trial', 0.00, None, None, None),
				('Basic', 2999.00, 8499.00, 15999.00, 29999.00),
				('Premium', 4999.00, 13999.00, 25999.00, 47999.00),
				('Enterprise', 7999.00, 21999.00, 41999.00, 77999.00),
			]
			
			for plan_name, monthly, quarterly, semi_annual, annual in default_plans:
				if plan_name not in existing_names:
					conn.execute(text('''
						insert into subscription_plans (plan_name, monthly_price, quarterly_price, semi_annual_price, annual_price)
						values (:name, :monthly, :quarterly, :semi, :annual)
					'''), {
						'name': plan_name,
						'monthly': monthly,
						'quarterly': quarterly,
						'semi': semi_annual,
						'annual': annual
					})
			
			print('[ensure_subscription_plans_table] Subscription plans table ensured')
	except Exception as e:
		print(f'[ensure_subscription_plans_table] Error: {e}')


def ensure_subscription_status_enum():
	"""Ensure sub_status enum type includes all necessary values"""
	try:
		with engine.begin() as conn:
			# Check if enum exists
			enum_exists = conn.execute(text('''
				select exists (
					select 1 from pg_type where typname = 'sub_status'
				)
			''')).scalar()
			
			if not enum_exists:
				# Create enum type with all values
				conn.execute(text('''
					create type sub_status as enum ('active', 'deactivated', 'cancelled', 'expired')
				'''))
				print('[ensure_subscription_status_enum] Created sub_status enum type')
			else:
				# Check if 'deactivated' exists in enum
				has_deactivated = conn.execute(text('''
					select exists (
						select 1 from pg_enum 
						where enumlabel = 'deactivated' 
						and enumtypid = (select oid from pg_type where typname = 'sub_status')
					)
				''')).scalar()
				
				if not has_deactivated:
					# Add 'deactivated' to enum
					conn.execute(text('''
						alter type sub_status add value 'deactivated'
					'''))
					print('[ensure_subscription_status_enum] Added "deactivated" to sub_status enum')
	except Exception as e:
		# If enum already has deactivated or other error, continue
		print(f'[ensure_subscription_status_enum] Note: {e}')


def ensure_subscription_payment_fields():
	"""Ensure subscriptions table has payment_method and gcash_payment_id columns"""
	try:
		with engine.begin() as conn:
			# Add payment_method column if it doesn't exist
			conn.execute(text('''
				DO $$ 
				BEGIN
					IF NOT EXISTS (
						SELECT 1 FROM information_schema.columns 
						WHERE table_name='subscriptions' AND column_name='payment_method'
					) THEN
						ALTER TABLE subscriptions ADD COLUMN payment_method VARCHAR(20) DEFAULT 'xendit';
					END IF;
				END $$;
			'''))
			
			# Add gcash_payment_id column if it doesn't exist
			conn.execute(text('''
				DO $$ 
				BEGIN
					IF NOT EXISTS (
						SELECT 1 FROM information_schema.columns 
						WHERE table_name='subscriptions' AND column_name='gcash_payment_id'
					) THEN
						ALTER TABLE subscriptions ADD COLUMN gcash_payment_id TEXT;
					END IF;
				END $$;
			'''))
			
			print('[ensure_subscription_payment_fields] Payment fields ensured')
	except Exception as e:
		print(f'[ensure_subscription_payment_fields] Error: {e}')

