import { seed } from "../prisma/seed.js";
import { prisma } from "../src/db/prisma.js";

// Tests run against the seeded demo database. Seeding is idempotent.
export default async function globalSetup(): Promise<void> {
  try {
    await seed();
  } finally {
    await prisma.$disconnect();
  }
}
