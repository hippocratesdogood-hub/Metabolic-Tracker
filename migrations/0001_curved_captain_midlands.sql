ALTER TABLE "food_entries" ADD COLUMN "parent_meal_id" varchar;--> statement-breakpoint
ALTER TABLE "food_entries" ADD COLUMN "item_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_consent_given" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_parent_meal_id_food_entries_id_fk" FOREIGN KEY ("parent_meal_id") REFERENCES "public"."food_entries"("id") ON DELETE cascade ON UPDATE no action;