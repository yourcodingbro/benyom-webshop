import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_roles" AS ENUM('admin');
  CREATE TYPE "public"."enum_products_variants_orderability" AS ENUM('preorderable', 'temporarily_unavailable', 'discontinued');
  CREATE TYPE "public"."enum_products_orderability" AS ENUM('preorderable', 'temporarily_unavailable', 'discontinued');
  CREATE TYPE "public"."enum_products_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__products_v_version_variants_orderability" AS ENUM('preorderable', 'temporarily_unavailable', 'discontinued');
  CREATE TYPE "public"."enum__products_v_version_orderability" AS ENUM('preorderable', 'temporarily_unavailable', 'discontinued');
  CREATE TYPE "public"."enum__products_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_orders_fulfillment_status" AS ENUM('received', 'under_review', 'confirmed', 'procurement_in_progress', 'ready_for_collection', 'dispatched', 'completed', 'cancelled');
  CREATE TYPE "public"."enum_orders_payment_status" AS ENUM('unpaid', 'paid', 'void');
  CREATE TYPE "public"."enum_orders_price_approval_status" AS ENUM('not_required', 'pending', 'accepted', 'rejected', 'expired');
  CREATE TYPE "public"."enum_orders_cancellation_reason" AS ENUM('price_change_rejected', 'price_change_timeout', 'admin');
  CREATE TYPE "public"."enum_order_events_type" AS ENUM('submitted', 'imported', 'status_changed', 'payment_changed', 'admin_edit', 'note_added', 'price_review_flagged', 'proposal_created', 'proposal_superseded', 'proposal_accepted', 'proposal_rejected', 'proposal_expired', 'proposal_withdrawn', 'cancelled', 'notification_queued', 'notification_skipped', 'notification_submitted', 'notification_failed', 'notification_delivered', 'notification_bounced');
  CREATE TYPE "public"."enum_order_events_actor_type" AS ENUM('admin', 'customer', 'system');
  CREATE TYPE "public"."enum_price_change_proposals_status" AS ENUM('pending', 'accepted', 'rejected', 'expired', 'superseded', 'withdrawn');
  CREATE TYPE "public"."enum_email_messages_template_id" AS ENUM('order-received', 'store-new-order', 'price-change-proposal', 'price-change-reminder', 'price-change-accepted', 'cancelled-after-rejection', 'cancelled-after-timeout', 'cancelled-by-store', 'fulfillment-update', 'contact-message');
  CREATE TYPE "public"."enum_email_messages_category" AS ENUM('customer', 'store', 'contact');
  CREATE TYPE "public"."enum_email_messages_status" AS ENUM('queued', 'submitted', 'delivered', 'failed', 'bounced', 'suppressed', 'cancelled', 'skipped', 'simulated');
  CREATE TYPE "public"."enum_email_messages_mode" AS ENUM('resend', 'log', 'invalid');
  CREATE TYPE "public"."enum_contact_messages_notification_status" AS ENUM('pending', 'sent', 'sent_simulated', 'failed');
  CREATE TYPE "public"."enum_import_jobs_status" AS ENUM('previewed', 'running', 'completed', 'failed');
  CREATE TYPE "public"."enum_store_settings_delivery_methods_kind" AS ENUM('collection', 'delivery');
  CREATE TYPE "public"."enum_store_settings_delivery_methods_fee_kind" AS ENUM('unknown', 'free', 'fixed');
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"brand_slug" varchar NOT NULL,
  	"category_slug" varchar NOT NULL,
  	"product_slug" varchar NOT NULL,
  	"color_hex" varchar,
  	"object_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar
  );
  
  CREATE TABLE "brands" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 100,
  	"popularity_rank" numeric DEFAULT 100 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categories" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 100,
  	"popularity_rank" numeric DEFAULT 100 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "products_specifications_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar
  );
  
  CREATE TABLE "products_specifications" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar
  );
  
  CREATE TABLE "products_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sku" varchar,
  	"color_hex" varchar,
  	"color_label" varchar,
  	"storage_gb" numeric,
  	"ram_gb" numeric,
  	"case_size_mm" numeric,
  	"price" numeric,
  	"orderability" "enum_products_variants_orderability" DEFAULT 'preorderable',
  	"procurement_estimate_min_days" numeric,
  	"procurement_estimate_max_days" numeric
  );
  
  CREATE TABLE "products" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"model" varchar,
  	"brand_id" varchar,
  	"description" varchar,
  	"featured" boolean DEFAULT false,
  	"orderability" "enum_products_orderability" DEFAULT 'preorderable',
  	"procurement_estimate_min_days" numeric,
  	"procurement_estimate_max_days" numeric,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_products_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "products_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" varchar NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" varchar,
  	"media_id" integer
  );
  
  CREATE TABLE "_products_v_version_specifications_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_specifications" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"sku" varchar,
  	"color_hex" varchar,
  	"color_label" varchar,
  	"storage_gb" numeric,
  	"ram_gb" numeric,
  	"case_size_mm" numeric,
  	"price" numeric,
  	"orderability" "enum__products_v_version_variants_orderability" DEFAULT 'preorderable',
  	"procurement_estimate_min_days" numeric,
  	"procurement_estimate_max_days" numeric,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" varchar,
  	"version_name" varchar,
  	"version_slug" varchar,
  	"version_model" varchar,
  	"version_brand_id" varchar,
  	"version_description" varchar,
  	"version_featured" boolean DEFAULT false,
  	"version_orderability" "enum__products_v_version_orderability" DEFAULT 'preorderable',
  	"version_procurement_estimate_min_days" numeric,
  	"version_procurement_estimate_max_days" numeric,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__products_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_products_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" varchar,
  	"media_id" integer
  );
  
  CREATE TABLE "orders_admin_notes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL,
  	"at" timestamp(3) with time zone
  );
  
  CREATE TABLE "orders_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"line_id" varchar,
  	"product_name" varchar,
  	"sku" varchar,
  	"color_hex" varchar,
  	"attributes" varchar,
  	"unit_price" numeric NOT NULL,
  	"quantity" numeric,
  	"line_total" numeric NOT NULL,
  	"catalog_unit_price" numeric NOT NULL
  );
  
  CREATE TABLE "orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"reference" varchar NOT NULL,
  	"is_demo" boolean DEFAULT false,
  	"idempotency_key" varchar NOT NULL,
  	"submission_hash" varchar,
  	"submitted_at" timestamp(3) with time zone,
  	"version" numeric DEFAULT 1,
  	"fulfillment_status" "enum_orders_fulfillment_status" DEFAULT 'received' NOT NULL,
  	"payment_status" "enum_orders_payment_status" DEFAULT 'unpaid' NOT NULL,
  	"price_approval_status" "enum_orders_price_approval_status" DEFAULT 'not_required' NOT NULL,
  	"needs_price_review" boolean,
  	"cancellation_reason" "enum_orders_cancellation_reason",
  	"cancellation_note" varchar,
  	"cancellation_at" timestamp(3) with time zone,
  	"submitted_totals_items_total" numeric NOT NULL,
  	"submitted_totals_delivery_fee" numeric NOT NULL,
  	"submitted_totals_grand_total" numeric NOT NULL,
  	"submitted_totals_currency" varchar DEFAULT 'HUF',
  	"agreed_totals_items_total" numeric NOT NULL,
  	"agreed_totals_delivery_fee" numeric NOT NULL,
  	"agreed_totals_grand_total" numeric NOT NULL,
  	"agreed_totals_currency" varchar DEFAULT 'HUF',
  	"agreed" jsonb,
  	"submission" jsonb,
  	"customer_name" varchar,
  	"customer_email" varchar,
  	"customer_phone" varchar,
  	"customer_company_name" varchar,
  	"customer_tax_number" varchar,
  	"billing_address_postal_code" varchar,
  	"billing_address_city" varchar,
  	"billing_address_street" varchar,
  	"billing_address_country" varchar DEFAULT 'HU',
  	"shipping_address_postal_code" varchar,
  	"shipping_address_city" varchar,
  	"shipping_address_street" varchar,
  	"shipping_address_country" varchar DEFAULT 'HU',
  	"delivery_method_id" varchar,
  	"delivery_kind" varchar,
  	"delivery_name" varchar,
  	"delivery_fee" numeric NOT NULL,
  	"note" varchar,
  	"terms_terms_version" varchar,
  	"terms_privacy_version" varchar,
  	"terms_accepted_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "order_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order_id" integer NOT NULL,
  	"order_reference" varchar NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL,
  	"type" "enum_order_events_type" NOT NULL,
  	"actor_type" "enum_order_events_actor_type" NOT NULL,
  	"actor_user_id" integer,
  	"actor_label" varchar NOT NULL,
  	"message" varchar NOT NULL,
  	"reason" varchar,
  	"previous_value" jsonb,
  	"new_value" jsonb,
  	"proposal_id" varchar,
  	"email_message_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "price_change_proposals_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"line_id" varchar NOT NULL,
  	"sku" varchar,
  	"product_name" varchar,
  	"quantity" numeric,
  	"original_unit_price" numeric NOT NULL,
  	"proposed_unit_price" numeric NOT NULL
  );
  
  CREATE TABLE "price_change_proposals" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"order_id" integer NOT NULL,
  	"order_reference" varchar NOT NULL,
  	"status" "enum_price_change_proposals_status" DEFAULT 'pending' NOT NULL,
  	"is_demo" boolean DEFAULT false,
  	"version" numeric DEFAULT 1,
  	"explanation" varchar NOT NULL,
  	"original_totals_items_total" numeric NOT NULL,
  	"original_totals_delivery_fee" numeric NOT NULL,
  	"original_totals_grand_total" numeric NOT NULL,
  	"original_totals_currency" varchar DEFAULT 'HUF',
  	"proposed_totals_items_total" numeric NOT NULL,
  	"proposed_totals_delivery_fee" numeric NOT NULL,
  	"proposed_totals_grand_total" numeric NOT NULL,
  	"proposed_totals_currency" varchar DEFAULT 'HUF',
  	"proposal_email_attempts" numeric DEFAULT 0,
  	"proposal_email_first_attempt_at" timestamp(3) with time zone,
  	"proposal_email_last_attempt_at" timestamp(3) with time zone,
  	"proposal_email_last_error" varchar,
  	"proposal_email_claimed_at" timestamp(3) with time zone,
  	"proposal_email_sent_at" timestamp(3) with time zone,
  	"reminder_email_attempts" numeric DEFAULT 0,
  	"reminder_email_first_attempt_at" timestamp(3) with time zone,
  	"reminder_email_last_attempt_at" timestamp(3) with time zone,
  	"reminder_email_last_error" varchar,
  	"reminder_email_claimed_at" timestamp(3) with time zone,
  	"reminder_email_sent_at" timestamp(3) with time zone,
  	"resolved_at" timestamp(3) with time zone,
  	"supersedes_id" varchar,
  	"superseded_by_id" varchar,
  	"created_by" varchar,
  	"created_by_user_id" integer,
  	"proposal_token_hash" varchar,
  	"reminder_token_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "email_messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"template_id" "enum_email_messages_template_id" NOT NULL,
  	"category" "enum_email_messages_category" NOT NULL,
  	"status" "enum_email_messages_status" NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"to" varchar NOT NULL,
  	"from" varchar,
  	"reply_to" varchar,
  	"subject" varchar,
  	"mode" "enum_email_messages_mode",
  	"order_id" integer,
  	"order_reference" varchar,
  	"proposal_id" varchar,
  	"contact_message_id" varchar,
  	"is_demo" boolean DEFAULT false,
  	"attempts" numeric DEFAULT 0,
  	"queued_at" timestamp(3) with time zone,
  	"next_attempt_at" timestamp(3) with time zone,
  	"claimed_at" timestamp(3) with time zone,
  	"first_attempt_at" timestamp(3) with time zone,
  	"last_attempt_at" timestamp(3) with time zone,
  	"submitted_at" timestamp(3) with time zone,
  	"delivered_at" timestamp(3) with time zone,
  	"provider_message_id" varchar,
  	"last_event_type" varchar,
  	"last_event_at" timestamp(3) with time zone,
  	"last_error" varchar,
  	"skip_reason" varchar,
  	"template_ref" jsonb,
  	"preview_html" varchar,
  	"preview_text" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "email_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_id" varchar NOT NULL,
  	"type" varchar NOT NULL,
  	"provider_message_id" varchar,
  	"email_message_id" integer,
  	"occurred_at" timestamp(3) with time zone,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"applied" boolean DEFAULT false,
  	"detail" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "contact_messages" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"submission_key" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"subject" varchar NOT NULL,
  	"message" varchar NOT NULL,
  	"privacy_version" varchar,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"notification_status" "enum_contact_messages_notification_status" DEFAULT 'pending' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "import_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"file_name" varchar NOT NULL,
  	"status" "enum_import_jobs_status" NOT NULL,
  	"created_by_id" integer,
  	"created_by_label" varchar,
  	"started_at" timestamp(3) with time zone,
  	"heartbeat_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"error" varchar,
  	"preview_report" jsonb,
  	"results" jsonb,
  	"final_report" jsonb,
  	"csv" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"brands_id" varchar,
  	"categories_id" varchar,
  	"products_id" varchar,
  	"orders_id" integer,
  	"order_events_id" integer,
  	"price_change_proposals_id" varchar,
  	"email_messages_id" integer,
  	"email_events_id" integer,
  	"contact_messages_id" varchar,
  	"import_jobs_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "store_settings_collection_opening_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"line" varchar NOT NULL
  );
  
  CREATE TABLE "store_settings_delivery_methods" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"method_id" varchar NOT NULL,
  	"kind" "enum_store_settings_delivery_methods_kind" NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"enabled" boolean DEFAULT true,
  	"fee_kind" "enum_store_settings_delivery_methods_fee_kind" DEFAULT 'unknown' NOT NULL,
  	"fee_amount" numeric
  );
  
  CREATE TABLE "store_settings_homepage_highlights" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "store_settings_pages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"body" varchar NOT NULL
  );
  
  CREATE TABLE "store_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"store_name" varchar NOT NULL,
  	"store_notification_email" varchar NOT NULL,
  	"contact_recipient_email" varchar NOT NULL,
  	"contact_email" varchar,
  	"contact_phone" varchar,
  	"contact_address" varchar,
  	"collection_address" varchar,
  	"collection_note" varchar,
  	"legal_terms_version" varchar NOT NULL,
  	"legal_privacy_version" varchar NOT NULL,
  	"seo_default_title" varchar,
  	"seo_default_description" varchar,
  	"homepage_hero_title" varchar,
  	"homepage_hero_text" varchar,
  	"homepage_featured_heading" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "notification_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status_emails_under_review" boolean DEFAULT false,
  	"status_emails_confirmed" boolean DEFAULT true,
  	"status_emails_procurement_in_progress" boolean DEFAULT false,
  	"status_emails_ready_for_collection" boolean DEFAULT true,
  	"status_emails_dispatched" boolean DEFAULT true,
  	"status_emails_completed" boolean DEFAULT true,
  	"status_emails_cancelled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_specifications_items" ADD CONSTRAINT "products_specifications_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products_specifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_specifications" ADD CONSTRAINT "products_specifications_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_variants" ADD CONSTRAINT "products_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_specifications_items" ADD CONSTRAINT "_products_v_version_specifications_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v_version_specifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_specifications" ADD CONSTRAINT "_products_v_version_specifications_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_variants" ADD CONSTRAINT "_products_v_version_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_parent_id_products_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_brand_id_brands_id_fk" FOREIGN KEY ("version_brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders_admin_notes" ADD CONSTRAINT "orders_admin_notes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "order_events" ADD CONSTRAINT "order_events_proposal_id_price_change_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."price_change_proposals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "order_events" ADD CONSTRAINT "order_events_email_message_id_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."email_messages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "price_change_proposals_lines" ADD CONSTRAINT "price_change_proposals_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."price_change_proposals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "price_change_proposals" ADD CONSTRAINT "price_change_proposals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "price_change_proposals" ADD CONSTRAINT "price_change_proposals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_proposal_id_price_change_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."price_change_proposals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_contact_message_id_contact_messages_id_fk" FOREIGN KEY ("contact_message_id") REFERENCES "public"."contact_messages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_message_id_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."email_messages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_brands_fk" FOREIGN KEY ("brands_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_order_events_fk" FOREIGN KEY ("order_events_id") REFERENCES "public"."order_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_price_change_proposals_fk" FOREIGN KEY ("price_change_proposals_id") REFERENCES "public"."price_change_proposals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_messages_fk" FOREIGN KEY ("email_messages_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_events_fk" FOREIGN KEY ("email_events_id") REFERENCES "public"."email_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contact_messages_fk" FOREIGN KEY ("contact_messages_id") REFERENCES "public"."contact_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_import_jobs_fk" FOREIGN KEY ("import_jobs_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "store_settings_collection_opening_hours" ADD CONSTRAINT "store_settings_collection_opening_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."store_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "store_settings_delivery_methods" ADD CONSTRAINT "store_settings_delivery_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."store_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "store_settings_homepage_highlights" ADD CONSTRAINT "store_settings_homepage_highlights_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."store_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "store_settings_pages" ADD CONSTRAINT "store_settings_pages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."store_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX "media_object_key_idx" ON "media" USING btree ("object_key");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE UNIQUE INDEX "brands_slug_idx" ON "brands" USING btree ("slug");
  CREATE INDEX "brands_updated_at_idx" ON "brands" USING btree ("updated_at");
  CREATE INDEX "brands_created_at_idx" ON "brands" USING btree ("created_at");
  CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE INDEX "products_specifications_items_order_idx" ON "products_specifications_items" USING btree ("_order");
  CREATE INDEX "products_specifications_items_parent_id_idx" ON "products_specifications_items" USING btree ("_parent_id");
  CREATE INDEX "products_specifications_order_idx" ON "products_specifications" USING btree ("_order");
  CREATE INDEX "products_specifications_parent_id_idx" ON "products_specifications" USING btree ("_parent_id");
  CREATE INDEX "products_variants_order_idx" ON "products_variants" USING btree ("_order");
  CREATE INDEX "products_variants_parent_id_idx" ON "products_variants" USING btree ("_parent_id");
  CREATE INDEX "products_variants_sku_idx" ON "products_variants" USING btree ("sku");
  CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");
  CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE INDEX "products__status_idx" ON "products" USING btree ("_status");
  CREATE INDEX "products_rels_order_idx" ON "products_rels" USING btree ("order");
  CREATE INDEX "products_rels_parent_idx" ON "products_rels" USING btree ("parent_id");
  CREATE INDEX "products_rels_path_idx" ON "products_rels" USING btree ("path");
  CREATE INDEX "products_rels_categories_id_idx" ON "products_rels" USING btree ("categories_id");
  CREATE INDEX "products_rels_media_id_idx" ON "products_rels" USING btree ("media_id");
  CREATE INDEX "_products_v_version_specifications_items_order_idx" ON "_products_v_version_specifications_items" USING btree ("_order");
  CREATE INDEX "_products_v_version_specifications_items_parent_id_idx" ON "_products_v_version_specifications_items" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_specifications_order_idx" ON "_products_v_version_specifications" USING btree ("_order");
  CREATE INDEX "_products_v_version_specifications_parent_id_idx" ON "_products_v_version_specifications" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_variants_order_idx" ON "_products_v_version_variants" USING btree ("_order");
  CREATE INDEX "_products_v_version_variants_parent_id_idx" ON "_products_v_version_variants" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_variants_sku_idx" ON "_products_v_version_variants" USING btree ("sku");
  CREATE INDEX "_products_v_parent_idx" ON "_products_v" USING btree ("parent_id");
  CREATE INDEX "_products_v_version_version_slug_idx" ON "_products_v" USING btree ("version_slug");
  CREATE INDEX "_products_v_version_version_brand_idx" ON "_products_v" USING btree ("version_brand_id");
  CREATE INDEX "_products_v_version_version_updated_at_idx" ON "_products_v" USING btree ("version_updated_at");
  CREATE INDEX "_products_v_version_version_created_at_idx" ON "_products_v" USING btree ("version_created_at");
  CREATE INDEX "_products_v_version_version__status_idx" ON "_products_v" USING btree ("version__status");
  CREATE INDEX "_products_v_created_at_idx" ON "_products_v" USING btree ("created_at");
  CREATE INDEX "_products_v_updated_at_idx" ON "_products_v" USING btree ("updated_at");
  CREATE INDEX "_products_v_latest_idx" ON "_products_v" USING btree ("latest");
  CREATE INDEX "_products_v_rels_order_idx" ON "_products_v_rels" USING btree ("order");
  CREATE INDEX "_products_v_rels_parent_idx" ON "_products_v_rels" USING btree ("parent_id");
  CREATE INDEX "_products_v_rels_path_idx" ON "_products_v_rels" USING btree ("path");
  CREATE INDEX "_products_v_rels_categories_id_idx" ON "_products_v_rels" USING btree ("categories_id");
  CREATE INDEX "_products_v_rels_media_id_idx" ON "_products_v_rels" USING btree ("media_id");
  CREATE INDEX "orders_admin_notes_order_idx" ON "orders_admin_notes" USING btree ("_order");
  CREATE INDEX "orders_admin_notes_parent_id_idx" ON "orders_admin_notes" USING btree ("_parent_id");
  CREATE INDEX "orders_items_order_idx" ON "orders_items" USING btree ("_order");
  CREATE INDEX "orders_items_parent_id_idx" ON "orders_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "orders_reference_idx" ON "orders" USING btree ("reference");
  CREATE INDEX "orders_is_demo_idx" ON "orders" USING btree ("is_demo");
  CREATE UNIQUE INDEX "orders_idempotency_key_idx" ON "orders" USING btree ("idempotency_key");
  CREATE INDEX "orders_submitted_at_idx" ON "orders" USING btree ("submitted_at");
  CREATE INDEX "orders_fulfillment_status_idx" ON "orders" USING btree ("fulfillment_status");
  CREATE INDEX "orders_price_approval_status_idx" ON "orders" USING btree ("price_approval_status");
  CREATE INDEX "orders_customer_customer_name_idx" ON "orders" USING btree ("customer_name");
  CREATE INDEX "orders_customer_customer_email_idx" ON "orders" USING btree ("customer_email");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");
  CREATE INDEX "order_events_order_reference_idx" ON "order_events" USING btree ("order_reference");
  CREATE INDEX "order_events_at_idx" ON "order_events" USING btree ("at");
  CREATE INDEX "order_events_type_idx" ON "order_events" USING btree ("type");
  CREATE INDEX "order_events_actor_user_idx" ON "order_events" USING btree ("actor_user_id");
  CREATE INDEX "order_events_proposal_idx" ON "order_events" USING btree ("proposal_id");
  CREATE INDEX "order_events_email_message_idx" ON "order_events" USING btree ("email_message_id");
  CREATE INDEX "order_events_updated_at_idx" ON "order_events" USING btree ("updated_at");
  CREATE INDEX "order_events_created_at_idx" ON "order_events" USING btree ("created_at");
  CREATE INDEX "price_change_proposals_lines_order_idx" ON "price_change_proposals_lines" USING btree ("_order");
  CREATE INDEX "price_change_proposals_lines_parent_id_idx" ON "price_change_proposals_lines" USING btree ("_parent_id");
  CREATE INDEX "price_change_proposals_order_idx" ON "price_change_proposals" USING btree ("order_id");
  CREATE INDEX "price_change_proposals_order_reference_idx" ON "price_change_proposals" USING btree ("order_reference");
  CREATE INDEX "price_change_proposals_status_idx" ON "price_change_proposals" USING btree ("status");
  CREATE INDEX "price_change_proposals_is_demo_idx" ON "price_change_proposals" USING btree ("is_demo");
  CREATE INDEX "price_change_proposals_created_by_user_idx" ON "price_change_proposals" USING btree ("created_by_user_id");
  CREATE INDEX "price_change_proposals_proposal_token_hash_idx" ON "price_change_proposals" USING btree ("proposal_token_hash");
  CREATE INDEX "price_change_proposals_reminder_token_hash_idx" ON "price_change_proposals" USING btree ("reminder_token_hash");
  CREATE INDEX "price_change_proposals_updated_at_idx" ON "price_change_proposals" USING btree ("updated_at");
  CREATE INDEX "price_change_proposals_created_at_idx" ON "price_change_proposals" USING btree ("created_at");
  CREATE INDEX "email_messages_template_id_idx" ON "email_messages" USING btree ("template_id");
  CREATE INDEX "email_messages_status_idx" ON "email_messages" USING btree ("status");
  CREATE UNIQUE INDEX "email_messages_idempotency_key_idx" ON "email_messages" USING btree ("idempotency_key");
  CREATE INDEX "email_messages_to_idx" ON "email_messages" USING btree ("to");
  CREATE INDEX "email_messages_order_idx" ON "email_messages" USING btree ("order_id");
  CREATE INDEX "email_messages_order_reference_idx" ON "email_messages" USING btree ("order_reference");
  CREATE INDEX "email_messages_proposal_idx" ON "email_messages" USING btree ("proposal_id");
  CREATE INDEX "email_messages_contact_message_idx" ON "email_messages" USING btree ("contact_message_id");
  CREATE INDEX "email_messages_is_demo_idx" ON "email_messages" USING btree ("is_demo");
  CREATE INDEX "email_messages_queued_at_idx" ON "email_messages" USING btree ("queued_at");
  CREATE INDEX "email_messages_next_attempt_at_idx" ON "email_messages" USING btree ("next_attempt_at");
  CREATE INDEX "email_messages_provider_message_id_idx" ON "email_messages" USING btree ("provider_message_id");
  CREATE INDEX "email_messages_updated_at_idx" ON "email_messages" USING btree ("updated_at");
  CREATE INDEX "email_messages_created_at_idx" ON "email_messages" USING btree ("created_at");
  CREATE UNIQUE INDEX "email_events_event_id_idx" ON "email_events" USING btree ("event_id");
  CREATE INDEX "email_events_type_idx" ON "email_events" USING btree ("type");
  CREATE INDEX "email_events_provider_message_id_idx" ON "email_events" USING btree ("provider_message_id");
  CREATE INDEX "email_events_email_message_idx" ON "email_events" USING btree ("email_message_id");
  CREATE INDEX "email_events_updated_at_idx" ON "email_events" USING btree ("updated_at");
  CREATE INDEX "email_events_created_at_idx" ON "email_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "contact_messages_submission_key_idx" ON "contact_messages" USING btree ("submission_key");
  CREATE INDEX "contact_messages_updated_at_idx" ON "contact_messages" USING btree ("updated_at");
  CREATE INDEX "contact_messages_created_at_idx" ON "contact_messages" USING btree ("created_at");
  CREATE INDEX "import_jobs_status_idx" ON "import_jobs" USING btree ("status");
  CREATE INDEX "import_jobs_created_by_idx" ON "import_jobs" USING btree ("created_by_id");
  CREATE INDEX "import_jobs_updated_at_idx" ON "import_jobs" USING btree ("updated_at");
  CREATE INDEX "import_jobs_created_at_idx" ON "import_jobs" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_brands_id_idx" ON "payload_locked_documents_rels" USING btree ("brands_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_order_events_id_idx" ON "payload_locked_documents_rels" USING btree ("order_events_id");
  CREATE INDEX "payload_locked_documents_rels_price_change_proposals_id_idx" ON "payload_locked_documents_rels" USING btree ("price_change_proposals_id");
  CREATE INDEX "payload_locked_documents_rels_email_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("email_messages_id");
  CREATE INDEX "payload_locked_documents_rels_email_events_id_idx" ON "payload_locked_documents_rels" USING btree ("email_events_id");
  CREATE INDEX "payload_locked_documents_rels_contact_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("contact_messages_id");
  CREATE INDEX "payload_locked_documents_rels_import_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("import_jobs_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "store_settings_collection_opening_hours_order_idx" ON "store_settings_collection_opening_hours" USING btree ("_order");
  CREATE INDEX "store_settings_collection_opening_hours_parent_id_idx" ON "store_settings_collection_opening_hours" USING btree ("_parent_id");
  CREATE INDEX "store_settings_delivery_methods_order_idx" ON "store_settings_delivery_methods" USING btree ("_order");
  CREATE INDEX "store_settings_delivery_methods_parent_id_idx" ON "store_settings_delivery_methods" USING btree ("_parent_id");
  CREATE INDEX "store_settings_homepage_highlights_order_idx" ON "store_settings_homepage_highlights" USING btree ("_order");
  CREATE INDEX "store_settings_homepage_highlights_parent_id_idx" ON "store_settings_homepage_highlights" USING btree ("_parent_id");
  CREATE INDEX "store_settings_pages_order_idx" ON "store_settings_pages" USING btree ("_order");
  CREATE INDEX "store_settings_pages_parent_id_idx" ON "store_settings_pages" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "brands" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "products_specifications_items" CASCADE;
  DROP TABLE "products_specifications" CASCADE;
  DROP TABLE "products_variants" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "products_rels" CASCADE;
  DROP TABLE "_products_v_version_specifications_items" CASCADE;
  DROP TABLE "_products_v_version_specifications" CASCADE;
  DROP TABLE "_products_v_version_variants" CASCADE;
  DROP TABLE "_products_v" CASCADE;
  DROP TABLE "_products_v_rels" CASCADE;
  DROP TABLE "orders_admin_notes" CASCADE;
  DROP TABLE "orders_items" CASCADE;
  DROP TABLE "orders" CASCADE;
  DROP TABLE "order_events" CASCADE;
  DROP TABLE "price_change_proposals_lines" CASCADE;
  DROP TABLE "price_change_proposals" CASCADE;
  DROP TABLE "email_messages" CASCADE;
  DROP TABLE "email_events" CASCADE;
  DROP TABLE "contact_messages" CASCADE;
  DROP TABLE "import_jobs" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "store_settings_collection_opening_hours" CASCADE;
  DROP TABLE "store_settings_delivery_methods" CASCADE;
  DROP TABLE "store_settings_homepage_highlights" CASCADE;
  DROP TABLE "store_settings_pages" CASCADE;
  DROP TABLE "store_settings" CASCADE;
  DROP TABLE "notification_settings" CASCADE;
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_products_variants_orderability";
  DROP TYPE "public"."enum_products_orderability";
  DROP TYPE "public"."enum_products_status";
  DROP TYPE "public"."enum__products_v_version_variants_orderability";
  DROP TYPE "public"."enum__products_v_version_orderability";
  DROP TYPE "public"."enum__products_v_version_status";
  DROP TYPE "public"."enum_orders_fulfillment_status";
  DROP TYPE "public"."enum_orders_payment_status";
  DROP TYPE "public"."enum_orders_price_approval_status";
  DROP TYPE "public"."enum_orders_cancellation_reason";
  DROP TYPE "public"."enum_order_events_type";
  DROP TYPE "public"."enum_order_events_actor_type";
  DROP TYPE "public"."enum_price_change_proposals_status";
  DROP TYPE "public"."enum_email_messages_template_id";
  DROP TYPE "public"."enum_email_messages_category";
  DROP TYPE "public"."enum_email_messages_status";
  DROP TYPE "public"."enum_email_messages_mode";
  DROP TYPE "public"."enum_contact_messages_notification_status";
  DROP TYPE "public"."enum_import_jobs_status";
  DROP TYPE "public"."enum_store_settings_delivery_methods_kind";
  DROP TYPE "public"."enum_store_settings_delivery_methods_fee_kind";`)
}
