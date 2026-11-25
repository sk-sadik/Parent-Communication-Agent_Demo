import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI configuration (Prisma 7).
// The CLI is used for migrations and introspection, so it points at the direct,
// non-pooled connection. The application runtime uses DATABASE_URL (pooled)
// through the PrismaPg adapter in src/db/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
