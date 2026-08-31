


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."advising_banks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "branch" "text",
    "address" "text",
    "swift" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."advising_banks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "designation" "text",
    "role" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "app_users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'full_no_edit'::"text"])))
);


ALTER TABLE "public"."app_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "employee_id" "uuid",
    "att_date" "date" NOT NULL,
    "status" "text",
    "in_time" time without time zone,
    "out_time" time without time zone,
    "comments" "text",
    CONSTRAINT "attendance_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'absent'::"text", 'leave'::"text", 'holiday'::"text"])))
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_charges" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "lc_id" "uuid",
    "charge_date" "date" DEFAULT CURRENT_DATE,
    "description" "text",
    "amount" numeric(14,2)
);


ALTER TABLE "public"."bank_charges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_transactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "bank_id" "uuid",
    "txn_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "type" "text",
    "amount" numeric(14,2) NOT NULL,
    "reference" "text",
    "linked_voucher_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bank_transactions_type_check" CHECK (("type" = ANY (ARRAY['deposit'::"text", 'withdrawal'::"text", 'transfer'::"text"])))
);


ALTER TABLE "public"."bank_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."banks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "bank_name" "text" NOT NULL,
    "branch" "text",
    "account_number" "text",
    "account_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."banks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bom" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_id" "uuid",
    "material_id" "uuid",
    "ratio_percentage" numeric(5,2)
);


ALTER TABLE "public"."bom" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bonus_sheet" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "festival" "text" NOT NULL,
    "year" integer NOT NULL,
    "bonus_date" "date" NOT NULL,
    "basic" numeric NOT NULL,
    "tenure_months" numeric DEFAULT 0 NOT NULL,
    "bonus_amount" numeric DEFAULT 0 NOT NULL,
    "paid" boolean DEFAULT false NOT NULL,
    "voucher_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bonus_sheet_festival_check" CHECK (("festival" = ANY (ARRAY['eid_ul_fitr'::"text", 'eid_ul_azha'::"text"])))
);


ALTER TABLE "public"."bonus_sheet" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_materials" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "booking_id" "uuid",
    "material_id" "uuid",
    "quantity_lbs" numeric(14,2) NOT NULL
);


ALTER TABLE "public"."booking_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "booking_no" "text" NOT NULL,
    "customer_id" "uuid",
    "product_id" "uuid",
    "quantity_pcs" numeric(14,2) NOT NULL,
    "booking_date" "date" DEFAULT CURRENT_DATE,
    "status" "text" DEFAULT 'open'::"text",
    "required_lbs" numeric(14,2),
    "required_kg" numeric(14,2),
    "required_bags" numeric(14,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "buyer_id" "uuid",
    "merchant_id" "uuid",
    "style" "text",
    "product_details" "text",
    "measurement_type" "text",
    "measurement_unit" "text" DEFAULT 'cm'::"text",
    "length_val" numeric(10,3),
    "width_val" numeric(10,3),
    "flap_val" numeric(10,3),
    "gusset_val" numeric(10,3),
    "thickness_mm" numeric(10,3),
    "material_type" "text",
    "delivery_point" "text",
    "print_layout_note" "text",
    "warehouse_id" "uuid",
    "customer_booking_ref" "text",
    "has_print" boolean DEFAULT false,
    "print_colors" integer DEFAULT 0,
    "rate_per_color" numeric(10,4) DEFAULT 0.20,
    "rate_per_inch" numeric(10,4) DEFAULT 0.02,
    "garments_name" "text",
    "booking_group_id" "uuid",
    "production_thickness_mm" numeric(10,3),
    "blowing_remark" "text",
    "printing_remark" "text",
    "cutting_remark" "text",
    "blowing_printed" boolean DEFAULT false,
    "printing_printed" boolean DEFAULT false,
    "cutting_printed" boolean DEFAULT false,
    "pi_thickness_mm" numeric(10,3),
    "garments_id" "uuid",
    CONSTRAINT "bookings_material_type_check" CHECK (("material_type" = ANY (ARRAY['pe_standard'::"text", 'pe_rld'::"text", 'pp'::"text", 'custom'::"text"]))),
    CONSTRAINT "bookings_measurement_type_check" CHECK (("measurement_type" = ANY (ARRAY['simple'::"text", 'adhesive'::"text", 'gusset'::"text"]))),
    CONSTRAINT "bookings_measurement_unit_check" CHECK (("measurement_unit" = ANY (ARRAY['cm'::"text", 'inch'::"text"]))),
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_production'::"text", 'partially_delivered'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."buyers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "customer_id" "uuid",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "pricing_rule" "text" DEFAULT 'manual'::"text",
    "percentage_value" numeric(10,4) DEFAULT 0,
    "rate_per_lbs_value" numeric(10,4) DEFAULT 0,
    "pi_thickness_mm" numeric(12,4),
    "adhesive_rate_per_inch" numeric(12,4),
    "print_colors_default" numeric(12,4),
    "color_quantity" integer,
    "booking_thickness_mm" numeric(12,4),
    "production_thickness_mm" numeric(10,3),
    "markup_percentage" numeric DEFAULT 2 NOT NULL,
    "usd_bdt_rate" numeric,
    "price_basis_default" "text" DEFAULT 'pcs'::"text" NOT NULL,
    "usd_surcharge_per_pc" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "buyers_price_basis_default_check" CHECK (("price_basis_default" = ANY (ARRAY['pcs'::"text", 'dzn'::"text"]))),
    CONSTRAINT "buyers_pricing_rule_check" CHECK (("pricing_rule" = ANY (ARRAY['manual'::"text", 'percentage'::"text", 'rate_per_lbs'::"text", 'rate_per_lbs_markup'::"text"])))
);


ALTER TABLE "public"."buyers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_transactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "txn_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "type" "text",
    "amount" numeric(14,2) NOT NULL,
    "reference" "text",
    "linked_voucher_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cash_transactions_type_check" CHECK (("type" = ANY (ARRAY['receipt'::"text", 'payment'::"text"])))
);


ALTER TABLE "public"."cash_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chart_of_accounts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "account_code" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "account_type" "text" NOT NULL,
    "parent_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chart_of_accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['asset'::"text", 'liability'::"text", 'equity'::"text", 'income'::"text", 'expense'::"text"])))
);


ALTER TABLE "public"."chart_of_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_profile" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" DEFAULT 'F & J Accessories'::"text" NOT NULL,
    "address" "text",
    "phone" "text",
    "email" "text",
    "tin" "text",
    "bin_vat" "text",
    "trade_license" "text",
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."company_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "customer_id" "uuid",
    "voucher_id" "uuid",
    "amount" numeric(14,2) NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "payment_mode" "text" DEFAULT 'cash'::"text",
    "deposit_account_id" "uuid",
    "bank_charges" numeric(14,2) DEFAULT 0
);


ALTER TABLE "public"."customer_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "phone" "text",
    "email" "text",
    "price_per_lbs" numeric(14,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "default_print_rate" numeric(10,4) DEFAULT 0.20,
    "default_adhesive_rate" numeric(10,4) DEFAULT 0.02,
    "opening_balance" numeric(14,2) DEFAULT 0,
    "opening_balance_date" "date" DEFAULT CURRENT_DATE,
    "code" "text"
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_challan_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "challan_id" "uuid",
    "product_id" "uuid",
    "quantity_pcs" numeric(14,2) NOT NULL
);


ALTER TABLE "public"."delivery_challan_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_challans" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "challan_no" "text" NOT NULL,
    "booking_id" "uuid",
    "customer_id" "uuid",
    "challan_date" "date" DEFAULT CURRENT_DATE,
    "is_partial" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "buyer_name" "text",
    "style" "text",
    "merchant_name" "text",
    "delivery_point" "text",
    "customer_booking_ref" "text",
    "delivery_status" "text" DEFAULT 'challan_ready'::"text",
    CONSTRAINT "delivery_challans_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['challan_ready'::"text", 'in_transit'::"text", 'delivery_done'::"text", 'challan_received'::"text"])))
);


ALTER TABLE "public"."delivery_challans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "designation" "text",
    "department" "text",
    "basic_salary" numeric(14,2),
    "join_date" "date",
    "is_active" boolean DEFAULT true,
    "employee_code" "text"
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exp_tracking" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "export_invoice_id" "uuid",
    "exp_no" "text",
    "submission_date" "date",
    "realization_date" "date",
    "status" "text" DEFAULT 'pending'::"text",
    CONSTRAINT "exp_tracking_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'submitted'::"text", 'realized'::"text"])))
);


ALTER TABLE "public"."exp_tracking" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "expense_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "account_id" "uuid",
    "paid_via_account_id" "uuid",
    "amount" numeric(14,2) NOT NULL,
    "payee" "text",
    "description" "text",
    "voucher_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."export_invoices" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "invoice_no" "text" NOT NULL,
    "lc_id" "uuid",
    "customer_id" "uuid",
    "invoice_date" "date" DEFAULT CURRENT_DATE,
    "amount" numeric(14,2),
    "style" "text",
    "buyer_name" "text"
);


ALTER TABLE "public"."export_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finished_goods" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_name" "text" NOT NULL,
    "length_cm" numeric(10,3) NOT NULL,
    "width_cm" numeric(10,3) NOT NULL,
    "thickness" numeric(10,4) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."finished_goods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finished_goods_receive" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "production_id" "uuid",
    "product_id" "uuid",
    "quantity_pcs" numeric(14,2) NOT NULL,
    "received_date" "date" DEFAULT CURRENT_DATE
);


ALTER TABLE "public"."finished_goods_receive" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finished_goods_stock" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_id" "uuid",
    "warehouse_id" "uuid",
    "quantity_pcs" numeric(14,2) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."finished_goods_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."garments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "customer_id" "uuid",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "address" "text"
);


ALTER TABLE "public"."garments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entry_lines" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "voucher_id" "uuid",
    "account_id" "uuid",
    "debit" numeric(14,2) DEFAULT 0,
    "credit" numeric(14,2) DEFAULT 0,
    "memo" "text"
);


ALTER TABLE "public"."journal_entry_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_vouchers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "voucher_no" "text" NOT NULL,
    "voucher_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "narration" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."journal_vouchers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lc_register" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "lc_type" "text",
    "lc_no" "text" NOT NULL,
    "bank_id" "uuid",
    "customer_id" "uuid",
    "supplier_id" "uuid",
    "lc_date" "date",
    "expiry_date" "date",
    "amount" numeric(14,2),
    "currency" "text" DEFAULT 'USD'::"text",
    "linked_pi_id" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "lc_register_lc_type_check" CHECK (("lc_type" = ANY (ARRAY['import'::"text", 'export'::"text"]))),
    CONSTRAINT "lc_register_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'closed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."lc_register" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."material_consumption" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "production_id" "uuid",
    "material_id" "uuid",
    "quantity_lbs" numeric(14,2) NOT NULL,
    "consumption_date" "date" DEFAULT CURRENT_DATE
);


ALTER TABLE "public"."material_consumption" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."merchants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."merchants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."overtime" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "employee_id" "uuid",
    "ot_date" "date" NOT NULL,
    "hours" numeric(5,2) NOT NULL,
    "rate_per_hour" numeric(10,2) DEFAULT 0
);


ALTER TABLE "public"."overtime" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."packing_lists" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "export_invoice_id" "uuid",
    "total_cartons" integer,
    "total_net_weight" numeric(14,2),
    "total_gross_weight" numeric(14,2)
);


ALTER TABLE "public"."packing_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partners" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "share_percentage" numeric(5,2),
    "phone" "text",
    "address" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."partners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_allocations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "payment_id" "uuid",
    "invoice_id" "uuid",
    "amount" numeric(14,2) NOT NULL
);


ALTER TABLE "public"."payment_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pi_bookings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "pi_id" "uuid",
    "booking_id" "uuid"
);


ALTER TABLE "public"."pi_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pi_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "pi_id" "uuid",
    "booking_id" "uuid",
    "sl_no" integer,
    "description" "text",
    "measurement" "text",
    "qty_pcs" numeric(14,2) DEFAULT 0 NOT NULL,
    "price_unit" numeric(14,4) DEFAULT 0 NOT NULL,
    "price_basis" "text" DEFAULT 'pcs'::"text" NOT NULL,
    "pi_thickness_mm" numeric,
    "print_charge" numeric DEFAULT 0 NOT NULL,
    "adhesive_charge" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "pi_items_price_basis_check" CHECK (("price_basis" = ANY (ARRAY['pcs'::"text", 'dzn'::"text"])))
);


ALTER TABLE "public"."pi_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."print_reprint_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "booking_group_id" "text" NOT NULL,
    "schedule_type" "text" NOT NULL,
    "requested_by" "uuid",
    "requested_by_name" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    CONSTRAINT "print_reprint_requests_schedule_type_check" CHECK (("schedule_type" = ANY (ARRAY['blowing'::"text", 'printing'::"text", 'cutting'::"text"]))),
    CONSTRAINT "print_reprint_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'denied'::"text", 'fulfilled'::"text"])))
);


ALTER TABLE "public"."print_reprint_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "production_no" "text" NOT NULL,
    "booking_id" "uuid",
    "product_id" "uuid",
    "quantity_pcs" numeric(14,2) NOT NULL,
    "stage" "text" DEFAULT 'blowing'::"text",
    "required_lbs" numeric(14,2),
    "order_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "blowing_completed_at" timestamp with time zone,
    "printing_completed_at" timestamp with time zone,
    "cutting_completed_at" timestamp with time zone,
    "blowing_produced_lbs" numeric(14,2) DEFAULT 0,
    "printing_produced_pcs" numeric(14,2) DEFAULT 0,
    "cutting_produced_pcs" numeric(14,2) DEFAULT 0,
    CONSTRAINT "production_orders_stage_check" CHECK (("stage" = ANY (ARRAY['blowing'::"text", 'printing'::"text", 'cutting'::"text", 'finished'::"text"])))
);


ALTER TABLE "public"."production_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proforma_invoices" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "pi_no" "text" NOT NULL,
    "customer_id" "uuid",
    "pi_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "style" "text",
    "buyer_name" "text",
    "merchant_name" "text",
    "total_amount" numeric(14,2),
    "currency" "text" DEFAULT 'USD'::"text",
    "discount_type" "text" DEFAULT 'none'::"text",
    "discount_value" numeric(14,4) DEFAULT 0,
    "revision" integer DEFAULT 0,
    "status" "text" DEFAULT 'draft'::"text",
    "terms_conditions" "text",
    "is_manual" boolean DEFAULT false,
    "parent_pi_id" "uuid",
    "garments_name" "text",
    "garments_address" "text",
    "advising_bank_name" "text",
    "advising_bank_branch" "text",
    "advising_bank_address" "text",
    "advising_bank_swift" "text",
    "hs_code" "text" DEFAULT '3923.21.00'::"text",
    "bin_no" "text" DEFAULT '000131803-1201'::"text",
    "total_weight_kg" numeric(14,2),
    "exchange_rate_to_bdt" numeric(10,4) DEFAULT 122,
    "valid_till" "date",
    "garments_id" "uuid",
    "advising_bank_id" "uuid",
    "item_description" "text",
    "price_decimals" integer DEFAULT 4 NOT NULL,
    CONSTRAINT "proforma_invoices_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed'::"text", 'none'::"text"]))),
    CONSTRAINT "proforma_invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'in_garments'::"text", 'lc_opened'::"text", 'paid'::"text"])))
);


ALTER TABLE "public"."proforma_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_entries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "po_id" "uuid",
    "supplier_id" "uuid",
    "entry_date" "date" DEFAULT CURRENT_DATE,
    "invoice_no" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "entry_no" "text",
    "payment_type" "text" DEFAULT 'credit'::"text" NOT NULL,
    "purchase_source" "text" DEFAULT 'local'::"text" NOT NULL,
    "lc_no" "text",
    "lc_date" "date",
    "bill_of_entry_no" "text",
    CONSTRAINT "purchase_entries_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['cash'::"text", 'credit'::"text"]))),
    CONSTRAINT "purchase_entries_purchase_source_check" CHECK (("purchase_source" = ANY (ARRAY['import'::"text", 'local'::"text"])))
);


ALTER TABLE "public"."purchase_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_entry_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "entry_id" "uuid",
    "material_id" "uuid",
    "quantity_lbs" numeric(14,2) NOT NULL,
    "rate_per_lbs" numeric(14,2) NOT NULL,
    "amount" numeric(14,2) GENERATED ALWAYS AS (("quantity_lbs" * "rate_per_lbs")) STORED,
    "unit" "text" DEFAULT 'lbs'::"text" NOT NULL,
    "entered_quantity" numeric,
    CONSTRAINT "purchase_entry_items_unit_check" CHECK (("unit" = ANY (ARRAY['lbs'::"text", 'bags'::"text"])))
);


ALTER TABLE "public"."purchase_entry_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "po_id" "uuid",
    "material_id" "uuid",
    "quantity_lbs" numeric(14,2) NOT NULL,
    "rate_per_lbs" numeric(14,2) NOT NULL
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "po_no" "text" NOT NULL,
    "supplier_id" "uuid",
    "po_date" "date" DEFAULT CURRENT_DATE,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "purchase_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'partial'::"text", 'received'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotation_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "quotation_id" "uuid",
    "product_id" "uuid",
    "quantity_pcs" numeric(14,2),
    "unit_price" numeric(14,4)
);


ALTER TABLE "public"."quotation_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "quotation_no" "text" NOT NULL,
    "customer_id" "uuid",
    "quotation_date" "date" DEFAULT CURRENT_DATE,
    "status" "text" DEFAULT 'draft'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "quotations_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."quotations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."raw_material_stock" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "material_id" "uuid",
    "warehouse_id" "uuid",
    "quantity_lbs" numeric(14,2) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."raw_material_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."raw_materials" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "material_name" "text" NOT NULL,
    "unit" "text" DEFAULT 'lbs'::"text" NOT NULL,
    "reorder_level_lbs" numeric(14,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "raw_materials_unit_check" CHECK (("unit" = ANY (ARRAY['lbs'::"text", 'kg'::"text", 'bag'::"text"])))
);


ALTER TABLE "public"."raw_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."salary_revisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "effective_date" "date" NOT NULL,
    "basic_salary" numeric NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."salary_revisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."salary_sheet" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "employee_id" "uuid",
    "month" integer NOT NULL,
    "year" integer NOT NULL,
    "basic" numeric(14,2),
    "overtime_amount" numeric(14,2),
    "deductions" numeric(14,2) DEFAULT 0,
    "net_salary" numeric(14,2),
    "paid" boolean DEFAULT false,
    "voucher_id" "uuid",
    "salary_type" "text" DEFAULT 'production'::"text" NOT NULL,
    "ot_hours" numeric DEFAULT 0 NOT NULL,
    "absent_days" integer DEFAULT 0 NOT NULL,
    "absent_hours" numeric DEFAULT 0 NOT NULL,
    "hourly_rate" numeric DEFAULT 0 NOT NULL,
    "absent_deduction" numeric DEFAULT 0 NOT NULL,
    "net_adjustment" numeric DEFAULT 0 NOT NULL,
    "advance" numeric DEFAULT 0 NOT NULL,
    "other_deduction" numeric DEFAULT 0 NOT NULL,
    "prorated" boolean DEFAULT false NOT NULL,
    "counted_days" integer,
    "days_in_month" integer
);


ALTER TABLE "public"."salary_sheet" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_invoice_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "invoice_id" "uuid",
    "product_id" "uuid",
    "quantity_pcs" numeric(14,2) NOT NULL,
    "unit_price" numeric(12,2) NOT NULL,
    "booking_id" "uuid",
    "amount" numeric(14,0) GENERATED ALWAYS AS ("floor"(("unit_price" * "quantity_pcs"))) STORED
);


ALTER TABLE "public"."sales_invoice_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_invoices" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "invoice_no" "text" NOT NULL,
    "customer_id" "uuid",
    "booking_id" "uuid",
    "invoice_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "buyer_name" "text",
    "style" "text",
    "merchant_name" "text",
    "delivery_point" "text",
    "voucher_id" "uuid",
    "customer_booking_ref" "text",
    "payment_received" boolean DEFAULT false,
    "payment_type" "text" DEFAULT 'credit'::"text",
    CONSTRAINT "sales_invoices_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['cash'::"text", 'credit'::"text"])))
);


ALTER TABLE "public"."sales_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_ledger" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "item_type" "text",
    "item_id" "uuid" NOT NULL,
    "warehouse_id" "uuid",
    "txn_type" "text",
    "quantity" numeric(14,2) NOT NULL,
    "reference_type" "text",
    "reference_id" "uuid",
    "txn_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "stock_ledger_item_type_check" CHECK (("item_type" = ANY (ARRAY['raw_material'::"text", 'finished_goods'::"text"]))),
    CONSTRAINT "stock_ledger_txn_type_check" CHECK (("txn_type" = ANY (ARRAY['in'::"text", 'out'::"text"])))
);


ALTER TABLE "public"."stock_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "supplier_id" "uuid",
    "voucher_id" "uuid",
    "amount" numeric(14,2) NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supplier_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouse_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transfer_no" "text" NOT NULL,
    "transfer_type" "text" NOT NULL,
    "from_warehouse_id" "uuid" NOT NULL,
    "to_warehouse_id" "uuid" NOT NULL,
    "material_id" "uuid" NOT NULL,
    "unit" "text" DEFAULT 'lbs'::"text" NOT NULL,
    "entered_quantity" numeric NOT NULL,
    "quantity_lbs" numeric NOT NULL,
    "transfer_date" "date" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "warehouse_transfers_transfer_type_check" CHECK (("transfer_type" = ANY (ARRAY['stock'::"text", 'wastage'::"text"]))),
    CONSTRAINT "warehouse_transfers_unit_check" CHECK (("unit" = ANY (ARRAY['lbs'::"text", 'bags'::"text"])))
);


ALTER TABLE "public"."warehouse_transfers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "location" "text"
);


ALTER TABLE "public"."warehouses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wastage" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "production_id" "uuid",
    "stage" "text",
    "quantity_lbs" numeric(14,2) NOT NULL,
    "recycled" boolean DEFAULT false,
    "wastage_date" "date" DEFAULT CURRENT_DATE,
    CONSTRAINT "wastage_stage_check" CHECK (("stage" = ANY (ARRAY['blowing'::"text", 'printing'::"text", 'cutting'::"text"])))
);


ALTER TABLE "public"."wastage" OWNER TO "postgres";


ALTER TABLE ONLY "public"."advising_banks"
    ADD CONSTRAINT "advising_banks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_charges"
    ADD CONSTRAINT "bank_charges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."banks"
    ADD CONSTRAINT "banks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bom"
    ADD CONSTRAINT "bom_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bonus_sheet"
    ADD CONSTRAINT "bonus_sheet_employee_id_festival_year_key" UNIQUE ("employee_id", "festival", "year");



ALTER TABLE ONLY "public"."bonus_sheet"
    ADD CONSTRAINT "bonus_sheet_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_materials"
    ADD CONSTRAINT "booking_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."buyers"
    ADD CONSTRAINT "buyers_customer_id_name_key" UNIQUE ("customer_id", "name");



ALTER TABLE ONLY "public"."buyers"
    ADD CONSTRAINT "buyers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_transactions"
    ADD CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_account_code_key" UNIQUE ("account_code");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_profile"
    ADD CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_payments"
    ADD CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_challan_items"
    ADD CONSTRAINT "delivery_challan_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_challans"
    ADD CONSTRAINT "delivery_challans_challan_no_key" UNIQUE ("challan_no");



ALTER TABLE ONLY "public"."delivery_challans"
    ADD CONSTRAINT "delivery_challans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_employee_code_key" UNIQUE ("employee_code");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exp_tracking"
    ADD CONSTRAINT "exp_tracking_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."export_invoices"
    ADD CONSTRAINT "export_invoices_invoice_no_key" UNIQUE ("invoice_no");



ALTER TABLE ONLY "public"."export_invoices"
    ADD CONSTRAINT "export_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finished_goods"
    ADD CONSTRAINT "finished_goods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finished_goods_receive"
    ADD CONSTRAINT "finished_goods_receive_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finished_goods_stock"
    ADD CONSTRAINT "finished_goods_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."garments"
    ADD CONSTRAINT "garments_customer_id_name_key" UNIQUE ("customer_id", "name");



ALTER TABLE ONLY "public"."garments"
    ADD CONSTRAINT "garments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_vouchers"
    ADD CONSTRAINT "journal_vouchers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_vouchers"
    ADD CONSTRAINT "journal_vouchers_voucher_no_key" UNIQUE ("voucher_no");



ALTER TABLE ONLY "public"."lc_register"
    ADD CONSTRAINT "lc_register_lc_no_key" UNIQUE ("lc_no");



ALTER TABLE ONLY "public"."lc_register"
    ADD CONSTRAINT "lc_register_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."material_consumption"
    ADD CONSTRAINT "material_consumption_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."overtime"
    ADD CONSTRAINT "overtime_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."packing_lists"
    ADD CONSTRAINT "packing_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pi_bookings"
    ADD CONSTRAINT "pi_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pi_items"
    ADD CONSTRAINT "pi_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."print_reprint_requests"
    ADD CONSTRAINT "print_reprint_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_orders"
    ADD CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_orders"
    ADD CONSTRAINT "production_orders_production_no_key" UNIQUE ("production_no");



ALTER TABLE ONLY "public"."proforma_invoices"
    ADD CONSTRAINT "proforma_invoices_pi_no_key" UNIQUE ("pi_no");



ALTER TABLE ONLY "public"."proforma_invoices"
    ADD CONSTRAINT "proforma_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_entries"
    ADD CONSTRAINT "purchase_entries_entry_no_key" UNIQUE ("entry_no");



ALTER TABLE ONLY "public"."purchase_entries"
    ADD CONSTRAINT "purchase_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_entry_items"
    ADD CONSTRAINT "purchase_entry_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_po_no_key" UNIQUE ("po_no");



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_quotation_no_key" UNIQUE ("quotation_no");



ALTER TABLE ONLY "public"."raw_material_stock"
    ADD CONSTRAINT "raw_material_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."raw_materials"
    ADD CONSTRAINT "raw_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salary_revisions"
    ADD CONSTRAINT "salary_revisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salary_sheet"
    ADD CONSTRAINT "salary_sheet_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_invoice_items"
    ADD CONSTRAINT "sales_invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_invoice_no_key" UNIQUE ("invoice_no");



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_ledger"
    ADD CONSTRAINT "stock_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouse_transfers"
    ADD CONSTRAINT "warehouse_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouse_transfers"
    ADD CONSTRAINT "warehouse_transfers_transfer_no_key" UNIQUE ("transfer_no");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wastage"
    ADD CONSTRAINT "wastage_pkey" PRIMARY KEY ("id");



CREATE INDEX "bonus_sheet_festival_idx" ON "public"."bonus_sheet" USING "btree" ("festival", "year");



CREATE UNIQUE INDEX "customers_code_unique_ci" ON "public"."customers" USING "btree" ("upper"("code")) WHERE (("code" IS NOT NULL) AND ("code" <> ''::"text"));



CREATE INDEX "salary_revisions_emp_idx" ON "public"."salary_revisions" USING "btree" ("employee_id", "effective_date" DESC);



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."bank_charges"
    ADD CONSTRAINT "bank_charges_lc_id_fkey" FOREIGN KEY ("lc_id") REFERENCES "public"."lc_register"("id");



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id");



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_linked_voucher_id_fkey" FOREIGN KEY ("linked_voucher_id") REFERENCES "public"."journal_vouchers"("id");



ALTER TABLE ONLY "public"."bom"
    ADD CONSTRAINT "bom_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."raw_materials"("id");



ALTER TABLE ONLY "public"."bom"
    ADD CONSTRAINT "bom_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."finished_goods"("id");



ALTER TABLE ONLY "public"."bonus_sheet"
    ADD CONSTRAINT "bonus_sheet_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bonus_sheet"
    ADD CONSTRAINT "bonus_sheet_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "public"."journal_vouchers"("id");



ALTER TABLE ONLY "public"."booking_materials"
    ADD CONSTRAINT "booking_materials_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_materials"
    ADD CONSTRAINT "booking_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."raw_materials"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_garments_id_fkey" FOREIGN KEY ("garments_id") REFERENCES "public"."garments"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."finished_goods"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."buyers"
    ADD CONSTRAINT "buyers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."cash_transactions"
    ADD CONSTRAINT "cash_transactions_linked_voucher_id_fkey" FOREIGN KEY ("linked_voucher_id") REFERENCES "public"."journal_vouchers"("id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."customer_payments"
    ADD CONSTRAINT "customer_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."customer_payments"
    ADD CONSTRAINT "customer_payments_deposit_account_id_fkey" FOREIGN KEY ("deposit_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."customer_payments"
    ADD CONSTRAINT "customer_payments_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "public"."journal_vouchers"("id");



ALTER TABLE ONLY "public"."delivery_challan_items"
    ADD CONSTRAINT "delivery_challan_items_challan_id_fkey" FOREIGN KEY ("challan_id") REFERENCES "public"."delivery_challans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_challan_items"
    ADD CONSTRAINT "delivery_challan_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."finished_goods"("id");



ALTER TABLE ONLY "public"."delivery_challans"
    ADD CONSTRAINT "delivery_challans_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."delivery_challans"
    ADD CONSTRAINT "delivery_challans_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."exp_tracking"
    ADD CONSTRAINT "exp_tracking_export_invoice_id_fkey" FOREIGN KEY ("export_invoice_id") REFERENCES "public"."export_invoices"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_paid_via_account_id_fkey" FOREIGN KEY ("paid_via_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "public"."journal_vouchers"("id");



ALTER TABLE ONLY "public"."export_invoices"
    ADD CONSTRAINT "export_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."export_invoices"
    ADD CONSTRAINT "export_invoices_lc_id_fkey" FOREIGN KEY ("lc_id") REFERENCES "public"."lc_register"("id");



ALTER TABLE ONLY "public"."finished_goods_receive"
    ADD CONSTRAINT "finished_goods_receive_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."finished_goods"("id");



ALTER TABLE ONLY "public"."finished_goods_receive"
    ADD CONSTRAINT "finished_goods_receive_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "public"."production_orders"("id");



ALTER TABLE ONLY "public"."finished_goods_stock"
    ADD CONSTRAINT "finished_goods_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."finished_goods"("id");



ALTER TABLE ONLY "public"."finished_goods_stock"
    ADD CONSTRAINT "finished_goods_stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."garments"
    ADD CONSTRAINT "garments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "public"."journal_vouchers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_vouchers"
    ADD CONSTRAINT "journal_vouchers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id");



ALTER TABLE ONLY "public"."lc_register"
    ADD CONSTRAINT "lc_register_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id");



ALTER TABLE ONLY "public"."lc_register"
    ADD CONSTRAINT "lc_register_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."lc_register"
    ADD CONSTRAINT "lc_register_linked_pi_id_fkey" FOREIGN KEY ("linked_pi_id") REFERENCES "public"."proforma_invoices"("id");



ALTER TABLE ONLY "public"."lc_register"
    ADD CONSTRAINT "lc_register_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."material_consumption"
    ADD CONSTRAINT "material_consumption_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."raw_materials"("id");



ALTER TABLE ONLY "public"."material_consumption"
    ADD CONSTRAINT "material_consumption_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "public"."production_orders"("id");



ALTER TABLE ONLY "public"."overtime"
    ADD CONSTRAINT "overtime_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."packing_lists"
    ADD CONSTRAINT "packing_lists_export_invoice_id_fkey" FOREIGN KEY ("export_invoice_id") REFERENCES "public"."export_invoices"("id");



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id");



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."customer_payments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pi_bookings"
    ADD CONSTRAINT "pi_bookings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."pi_bookings"
    ADD CONSTRAINT "pi_bookings_pi_id_fkey" FOREIGN KEY ("pi_id") REFERENCES "public"."proforma_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pi_items"
    ADD CONSTRAINT "pi_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."pi_items"
    ADD CONSTRAINT "pi_items_pi_id_fkey" FOREIGN KEY ("pi_id") REFERENCES "public"."proforma_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."print_reprint_requests"
    ADD CONSTRAINT "print_reprint_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."app_users"("id");



ALTER TABLE ONLY "public"."production_orders"
    ADD CONSTRAINT "production_orders_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."production_orders"
    ADD CONSTRAINT "production_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."finished_goods"("id");



ALTER TABLE ONLY "public"."proforma_invoices"
    ADD CONSTRAINT "proforma_invoices_advising_bank_id_fkey" FOREIGN KEY ("advising_bank_id") REFERENCES "public"."advising_banks"("id");



ALTER TABLE ONLY "public"."proforma_invoices"
    ADD CONSTRAINT "proforma_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."proforma_invoices"
    ADD CONSTRAINT "proforma_invoices_garments_id_fkey" FOREIGN KEY ("garments_id") REFERENCES "public"."garments"("id");



ALTER TABLE ONLY "public"."proforma_invoices"
    ADD CONSTRAINT "proforma_invoices_parent_pi_id_fkey" FOREIGN KEY ("parent_pi_id") REFERENCES "public"."proforma_invoices"("id");



ALTER TABLE ONLY "public"."purchase_entries"
    ADD CONSTRAINT "purchase_entries_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id");



ALTER TABLE ONLY "public"."purchase_entries"
    ADD CONSTRAINT "purchase_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."purchase_entry_items"
    ADD CONSTRAINT "purchase_entry_items_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."purchase_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_entry_items"
    ADD CONSTRAINT "purchase_entry_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."raw_materials"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."raw_materials"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."finished_goods"("id");



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."raw_material_stock"
    ADD CONSTRAINT "raw_material_stock_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."raw_materials"("id");



ALTER TABLE ONLY "public"."raw_material_stock"
    ADD CONSTRAINT "raw_material_stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."salary_revisions"
    ADD CONSTRAINT "salary_revisions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salary_sheet"
    ADD CONSTRAINT "salary_sheet_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."salary_sheet"
    ADD CONSTRAINT "salary_sheet_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "public"."journal_vouchers"("id");



ALTER TABLE ONLY "public"."sales_invoice_items"
    ADD CONSTRAINT "sales_invoice_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."sales_invoice_items"
    ADD CONSTRAINT "sales_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_invoice_items"
    ADD CONSTRAINT "sales_invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."finished_goods"("id");



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "public"."journal_vouchers"("id");



ALTER TABLE ONLY "public"."stock_ledger"
    ADD CONSTRAINT "stock_ledger_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "public"."journal_vouchers"("id");



ALTER TABLE ONLY "public"."warehouse_transfers"
    ADD CONSTRAINT "warehouse_transfers_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."warehouse_transfers"
    ADD CONSTRAINT "warehouse_transfers_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."raw_materials"("id");



ALTER TABLE ONLY "public"."warehouse_transfers"
    ADD CONSTRAINT "warehouse_transfers_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."wastage"
    ADD CONSTRAINT "wastage_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "public"."production_orders"("id");



CREATE POLICY "Authenticated users full access" ON "public"."advising_banks" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users full access" ON "public"."bonus_sheet" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users full access" ON "public"."salary_revisions" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users full access" ON "public"."warehouse_transfers" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."advising_banks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auth_full_access_att" ON "public"."attendance" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_bc" ON "public"."bank_charges" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_bm" ON "public"."booking_materials" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_bookings" ON "public"."bookings" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_buyers" ON "public"."buyers" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_cp" ON "public"."customer_payments" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_customers" ON "public"."customers" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_dc" ON "public"."delivery_challans" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_dci" ON "public"."delivery_challan_items" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_ei" ON "public"."export_invoices" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_emp" ON "public"."employees" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_exp" ON "public"."exp_tracking" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_expenses" ON "public"."expenses" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_fg" ON "public"."finished_goods" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_fgr" ON "public"."finished_goods_receive" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_fgs" ON "public"."finished_goods_stock" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_garments" ON "public"."garments" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_jel" ON "public"."journal_entry_lines" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_jv" ON "public"."journal_vouchers" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_lc" ON "public"."lc_register" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_mc" ON "public"."material_consumption" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_merchants" ON "public"."merchants" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_ot" ON "public"."overtime" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_pa" ON "public"."payment_allocations" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_pe" ON "public"."purchase_entries" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_pei" ON "public"."purchase_entry_items" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_pi" ON "public"."proforma_invoices" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_pi_items" ON "public"."pi_items" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_pib" ON "public"."pi_bookings" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_pl" ON "public"."packing_lists" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_po" ON "public"."production_orders" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_prr" ON "public"."print_reprint_requests" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_qt" ON "public"."quotations" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_qti" ON "public"."quotation_items" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_rm" ON "public"."raw_materials" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_rms" ON "public"."raw_material_stock" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_si" ON "public"."sales_invoices" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_sii" ON "public"."sales_invoice_items" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_sl" ON "public"."stock_ledger" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_sp" ON "public"."supplier_payments" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_ss" ON "public"."salary_sheet" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_suppliers" ON "public"."suppliers" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_warehouses" ON "public"."warehouses" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_full_access_wastage" ON "public"."wastage" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated_full_access_coa" ON "public"."chart_of_accounts" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated_read_app_users" ON "public"."app_users" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated_read_company" ON "public"."company_profile" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."bank_charges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bank_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."banks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bom" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bonus_sheet" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."buyers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chart_of_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_challan_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_challans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exp_tracking" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."export_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finished_goods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finished_goods_receive" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finished_goods_stock" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."garments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."journal_entry_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."journal_vouchers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lc_register" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."material_consumption" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."merchants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."overtime" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."packing_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."partners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pi_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pi_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."print_reprint_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."production_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proforma_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_entry_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quotation_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quotations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."raw_material_stock" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."raw_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."salary_revisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."salary_sheet" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_invoice_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouse_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wastage" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





































































































































































GRANT ALL ON TABLE "public"."advising_banks" TO "anon";
GRANT ALL ON TABLE "public"."advising_banks" TO "authenticated";
GRANT ALL ON TABLE "public"."advising_banks" TO "service_role";



GRANT ALL ON TABLE "public"."app_users" TO "anon";
GRANT ALL ON TABLE "public"."app_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_users" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "anon";
GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."bank_charges" TO "anon";
GRANT ALL ON TABLE "public"."bank_charges" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_charges" TO "service_role";



GRANT ALL ON TABLE "public"."bank_transactions" TO "anon";
GRANT ALL ON TABLE "public"."bank_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."banks" TO "anon";
GRANT ALL ON TABLE "public"."banks" TO "authenticated";
GRANT ALL ON TABLE "public"."banks" TO "service_role";



GRANT ALL ON TABLE "public"."bom" TO "anon";
GRANT ALL ON TABLE "public"."bom" TO "authenticated";
GRANT ALL ON TABLE "public"."bom" TO "service_role";



GRANT ALL ON TABLE "public"."bonus_sheet" TO "anon";
GRANT ALL ON TABLE "public"."bonus_sheet" TO "authenticated";
GRANT ALL ON TABLE "public"."bonus_sheet" TO "service_role";



GRANT ALL ON TABLE "public"."booking_materials" TO "anon";
GRANT ALL ON TABLE "public"."booking_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_materials" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."buyers" TO "anon";
GRANT ALL ON TABLE "public"."buyers" TO "authenticated";
GRANT ALL ON TABLE "public"."buyers" TO "service_role";



GRANT ALL ON TABLE "public"."cash_transactions" TO "anon";
GRANT ALL ON TABLE "public"."cash_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."chart_of_accounts" TO "anon";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."company_profile" TO "anon";
GRANT ALL ON TABLE "public"."company_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."company_profile" TO "service_role";



GRANT ALL ON TABLE "public"."customer_payments" TO "anon";
GRANT ALL ON TABLE "public"."customer_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_payments" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_challan_items" TO "anon";
GRANT ALL ON TABLE "public"."delivery_challan_items" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_challan_items" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_challans" TO "anon";
GRANT ALL ON TABLE "public"."delivery_challans" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_challans" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."exp_tracking" TO "anon";
GRANT ALL ON TABLE "public"."exp_tracking" TO "authenticated";
GRANT ALL ON TABLE "public"."exp_tracking" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."export_invoices" TO "anon";
GRANT ALL ON TABLE "public"."export_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."export_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."finished_goods" TO "anon";
GRANT ALL ON TABLE "public"."finished_goods" TO "authenticated";
GRANT ALL ON TABLE "public"."finished_goods" TO "service_role";



GRANT ALL ON TABLE "public"."finished_goods_receive" TO "anon";
GRANT ALL ON TABLE "public"."finished_goods_receive" TO "authenticated";
GRANT ALL ON TABLE "public"."finished_goods_receive" TO "service_role";



GRANT ALL ON TABLE "public"."finished_goods_stock" TO "anon";
GRANT ALL ON TABLE "public"."finished_goods_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."finished_goods_stock" TO "service_role";



GRANT ALL ON TABLE "public"."garments" TO "anon";
GRANT ALL ON TABLE "public"."garments" TO "authenticated";
GRANT ALL ON TABLE "public"."garments" TO "service_role";



GRANT ALL ON TABLE "public"."journal_entry_lines" TO "anon";
GRANT ALL ON TABLE "public"."journal_entry_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entry_lines" TO "service_role";



GRANT ALL ON TABLE "public"."journal_vouchers" TO "anon";
GRANT ALL ON TABLE "public"."journal_vouchers" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_vouchers" TO "service_role";



GRANT ALL ON TABLE "public"."lc_register" TO "anon";
GRANT ALL ON TABLE "public"."lc_register" TO "authenticated";
GRANT ALL ON TABLE "public"."lc_register" TO "service_role";



GRANT ALL ON TABLE "public"."material_consumption" TO "anon";
GRANT ALL ON TABLE "public"."material_consumption" TO "authenticated";
GRANT ALL ON TABLE "public"."material_consumption" TO "service_role";



GRANT ALL ON TABLE "public"."merchants" TO "anon";
GRANT ALL ON TABLE "public"."merchants" TO "authenticated";
GRANT ALL ON TABLE "public"."merchants" TO "service_role";



GRANT ALL ON TABLE "public"."overtime" TO "anon";
GRANT ALL ON TABLE "public"."overtime" TO "authenticated";
GRANT ALL ON TABLE "public"."overtime" TO "service_role";



GRANT ALL ON TABLE "public"."packing_lists" TO "anon";
GRANT ALL ON TABLE "public"."packing_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."packing_lists" TO "service_role";



GRANT ALL ON TABLE "public"."partners" TO "anon";
GRANT ALL ON TABLE "public"."partners" TO "authenticated";
GRANT ALL ON TABLE "public"."partners" TO "service_role";



GRANT ALL ON TABLE "public"."payment_allocations" TO "anon";
GRANT ALL ON TABLE "public"."payment_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."pi_bookings" TO "anon";
GRANT ALL ON TABLE "public"."pi_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."pi_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."pi_items" TO "anon";
GRANT ALL ON TABLE "public"."pi_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pi_items" TO "service_role";



GRANT ALL ON TABLE "public"."print_reprint_requests" TO "anon";
GRANT ALL ON TABLE "public"."print_reprint_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."print_reprint_requests" TO "service_role";



GRANT ALL ON TABLE "public"."production_orders" TO "anon";
GRANT ALL ON TABLE "public"."production_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."production_orders" TO "service_role";



GRANT ALL ON TABLE "public"."proforma_invoices" TO "anon";
GRANT ALL ON TABLE "public"."proforma_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."proforma_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_entries" TO "anon";
GRANT ALL ON TABLE "public"."purchase_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_entries" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_entry_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_entry_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_entry_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."quotation_items" TO "anon";
GRANT ALL ON TABLE "public"."quotation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."quotation_items" TO "service_role";



GRANT ALL ON TABLE "public"."quotations" TO "anon";
GRANT ALL ON TABLE "public"."quotations" TO "authenticated";
GRANT ALL ON TABLE "public"."quotations" TO "service_role";



GRANT ALL ON TABLE "public"."raw_material_stock" TO "anon";
GRANT ALL ON TABLE "public"."raw_material_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."raw_material_stock" TO "service_role";



GRANT ALL ON TABLE "public"."raw_materials" TO "anon";
GRANT ALL ON TABLE "public"."raw_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."raw_materials" TO "service_role";



GRANT ALL ON TABLE "public"."salary_revisions" TO "anon";
GRANT ALL ON TABLE "public"."salary_revisions" TO "authenticated";
GRANT ALL ON TABLE "public"."salary_revisions" TO "service_role";



GRANT ALL ON TABLE "public"."salary_sheet" TO "anon";
GRANT ALL ON TABLE "public"."salary_sheet" TO "authenticated";
GRANT ALL ON TABLE "public"."salary_sheet" TO "service_role";



GRANT ALL ON TABLE "public"."sales_invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."sales_invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_invoice_items" TO "service_role";



GRANT ALL ON TABLE "public"."sales_invoices" TO "anon";
GRANT ALL ON TABLE "public"."sales_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."stock_ledger" TO "anon";
GRANT ALL ON TABLE "public"."stock_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_payments" TO "anon";
GRANT ALL ON TABLE "public"."supplier_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_payments" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."warehouse_transfers" TO "anon";
GRANT ALL ON TABLE "public"."warehouse_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouse_transfers" TO "service_role";



GRANT ALL ON TABLE "public"."warehouses" TO "anon";
GRANT ALL ON TABLE "public"."warehouses" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouses" TO "service_role";



GRANT ALL ON TABLE "public"."wastage" TO "anon";
GRANT ALL ON TABLE "public"."wastage" TO "authenticated";
GRANT ALL ON TABLE "public"."wastage" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































