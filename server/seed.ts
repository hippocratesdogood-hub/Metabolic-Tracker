import { db } from "./storage";
import { users, macroTargets } from "@shared/schema";
import { crypto } from "./auth";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  const password = await crypto.hash("password123");
  
  // Create participant user
  await db.insert(users).values({
    email: "alex@example.com",
    name: "Alex Rivera",
    passwordHash: password,
    role: "participant",
  }).onConflictDoNothing();

  // Create a second participant
  await db.insert(users).values({
    email: "jordan@example.com",
    name: "Jordan Smith",
    passwordHash: password,
    role: "participant",
  }).onConflictDoNothing();

  // Create coach user
  await db.insert(users).values({
    email: "coach@example.com",
    name: "Coach Sarah",
    passwordHash: password,
    role: "coach",
  }).onConflictDoNothing();

  // Create admin user
  await db.insert(users).values({
    email: "admin@example.com",
    name: "Admin User",
    passwordHash: password,
    role: "admin",
  }).onConflictDoNothing();

  // Get the participant user for macro targets
  const [user] = await db.select().from(users).where(eq(users.email, "alex@example.com"));
  
  if (user) {
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

  // Add macro targets for Jordan
  const [jordan] = await db.select().from(users).where(eq(users.email, "jordan@example.com"));
  if (jordan) {
    await db.insert(macroTargets).values({
      userId: jordan.id,
      calories: 2000,
      proteinG: 150,
      carbsG: 120,
      fatG: 70,
      fiberG: 35,
    }).onConflictDoNothing();
    console.log("✅ Macro targets seeded for", jordan.email);
  }

  console.log("✅ Users created: alex@example.com, jordan@example.com (participants), coach@example.com (coach), admin@example.com (admin)");
  console.log("✅ Seed complete! (Default password set - change in production)");
  process.exit(0);
}

seed().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});
