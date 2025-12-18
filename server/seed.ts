import { db } from "./storage";
import { users, macroTargets } from "@shared/schema";
import { crypto } from "./auth";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  const password = await crypto.hash("password123");
  
  // Create or get test user
  await db.insert(users).values({
    email: "alex@example.com",
    name: "Alex Rivera",
    passwordHash: password,
    role: "participant",
  }).onConflictDoNothing();

  // Get the user
  const [user] = await db.select().from(users).where(eq(users.email, "alex@example.com"));
  
  if (user) {
    // Add macro targets
    await db.insert(macroTargets).values({
      userId: user.id,
      calories: 1800,
      proteinG: 120,
      carbsG: 100,
      fatG: 80,
      fiberG: 30,
      breakfastCalories: 400,
      breakfastProteinG: 30,
      lunchCalories: 500,
      lunchProteinG: 40,
      dinnerCalories: 600,
      dinnerProteinG: 40,
      snackCalories: 300,
      snackProteinG: 10,
    }).onConflictDoNothing();
    console.log("✅ Macro targets seeded for", user.email);
  }

  console.log("✅ Seed complete!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});
