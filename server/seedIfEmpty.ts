import { db } from "./storage";
import { users, macroTargets } from "@shared/schema";
import { crypto } from "./auth";
import { eq, count } from "drizzle-orm";

export async function seedIfEmpty() {
  const [{ count: userCount }] = await db.select({ count: count() }).from(users);
  
  if (userCount > 0) {
    console.log(`Database already has ${userCount} users, skipping seed.`);
    return;
  }

  console.log("No users found, seeding database with test accounts...");

  const password = await crypto.hash("password123");
  
  await db.insert(users).values({
    email: "alex@example.com",
    name: "Alex Rivera",
    passwordHash: password,
    role: "participant",
  }).onConflictDoNothing();

  await db.insert(users).values({
    email: "jordan@example.com",
    name: "Jordan Smith",
    passwordHash: password,
    role: "participant",
  }).onConflictDoNothing();

  await db.insert(users).values({
    email: "coach@example.com",
    name: "Coach Sarah",
    passwordHash: password,
    role: "coach",
  }).onConflictDoNothing();

  await db.insert(users).values({
    email: "admin@example.com",
    name: "Admin User",
    passwordHash: password,
    role: "admin",
  }).onConflictDoNothing();

  const [user] = await db.select().from(users).where(eq(users.email, "alex@example.com"));
  
  if (user) {
    await db.insert(macroTargets).values({
      userId: user.id,
      calories: 1800,
      proteinG: 120,
      carbsG: 100,
      fatG: 80,
      fiberG: 30,
    }).onConflictDoNothing();
  }

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
  }

  console.log("Test accounts created:");
  console.log("  - alex@example.com (participant)");
  console.log("  - jordan@example.com (participant)");
  console.log("  - coach@example.com (coach)");
  console.log("  - admin@example.com (admin)");
  console.log("  (Default passwords set - change in production)");
}
