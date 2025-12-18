import { db } from "./storage";
import { users } from "@shared/schema";
import { crypto } from "./auth";

async function seed() {
  console.log("Seeding database...");

  const password = await crypto.hash("password123");
  
  await db.insert(users).values({
    email: "alex@example.com",
    name: "Alex Rivera",
    passwordHash: password,
    role: "participant",
  }).onConflictDoNothing();

  console.log("✅ Seed complete!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});
