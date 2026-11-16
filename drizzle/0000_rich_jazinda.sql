CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estate_id" uuid NOT NULL,
	"predicate" text NOT NULL,
	"text" text NOT NULL,
	"author_name" text NOT NULL,
	"contact" text,
	"source_title" text NOT NULL,
	"source_page" text,
	"source_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estate_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estate_id" uuid NOT NULL,
	"name" text NOT NULL,
	"egrkn_reg_number" text NOT NULL,
	"egrkn_native_id" text NOT NULL,
	"object_type" text,
	"address" text,
	"typology" text
);
--> statement-breakpoint
CREATE TABLE "estate_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estate_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text NOT NULL,
	"year_from" integer,
	"year_to" integer,
	"source_id" uuid,
	"origin" text DEFAULT 'human' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"region_id" text NOT NULL,
	"region_name" text NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"egrkn_reg_number" text NOT NULL,
	"egrkn_native_id" text NOT NULL,
	"category" text,
	"object_type" text,
	"created_date_text" text,
	"protection_year" integer,
	"wikidata_qid" text,
	"wikipedia_url" text,
	"wikipedia_title" text,
	"summary" text,
	"summary_source" text,
	"raw_json" jsonb,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"wikidata_qid" text,
	"years" text
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estate_id" uuid NOT NULL,
	"url" text NOT NULL,
	"author" text,
	"license" text,
	"year" integer,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source_url" text,
	"origin" text DEFAULT 'commons' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"page" text,
	"url" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estate_id" uuid NOT NULL,
	"predicate" text NOT NULL,
	"text" text NOT NULL,
	"source_id" uuid,
	"status" text DEFAULT 'accepted' NOT NULL,
	"contribution_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_estate_id_estates_id_fk" FOREIGN KEY ("estate_id") REFERENCES "public"."estates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estate_parts" ADD CONSTRAINT "estate_parts_estate_id_estates_id_fk" FOREIGN KEY ("estate_id") REFERENCES "public"."estates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estate_people" ADD CONSTRAINT "estate_people_estate_id_estates_id_fk" FOREIGN KEY ("estate_id") REFERENCES "public"."estates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estate_people" ADD CONSTRAINT "estate_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estate_people" ADD CONSTRAINT "estate_people_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_estate_id_estates_id_fk" FOREIGN KEY ("estate_id") REFERENCES "public"."estates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_estate_id_estates_id_fk" FOREIGN KEY ("estate_id") REFERENCES "public"."estates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contributions_status_idx" ON "contributions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contributions_estate_idx" ON "contributions" USING btree ("estate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estate_parts_reg_idx" ON "estate_parts" USING btree ("egrkn_reg_number");--> statement-breakpoint
CREATE INDEX "estate_parts_estate_idx" ON "estate_parts" USING btree ("estate_id");--> statement-breakpoint
CREATE INDEX "estate_people_estate_idx" ON "estate_people" USING btree ("estate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estates_slug_idx" ON "estates" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "estates_reg_idx" ON "estates" USING btree ("egrkn_reg_number");--> statement-breakpoint
CREATE INDEX "estates_region_idx" ON "estates" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "estates_native_idx" ON "estates" USING btree ("egrkn_native_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_wikidata_idx" ON "people" USING btree ("wikidata_qid");--> statement-breakpoint
CREATE UNIQUE INDEX "photos_estate_url_idx" ON "photos" USING btree ("estate_id","url");--> statement-breakpoint
CREATE INDEX "statements_lookup_idx" ON "statements" USING btree ("estate_id","predicate","status");