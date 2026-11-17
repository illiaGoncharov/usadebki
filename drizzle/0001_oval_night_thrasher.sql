ALTER TABLE "estates" ADD COLUMN "wiki_style" text;--> statement-breakpoint
ALTER TABLE "estates" ADD COLUMN "wiki_styles" text[];--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "is_ensemble_part" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "is_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "depicts_egrkn_number" text;