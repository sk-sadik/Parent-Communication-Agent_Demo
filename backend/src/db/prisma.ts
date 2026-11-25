import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

// Standard Postgres connection (node-postgres pool) using the pooled
// DATABASE_URL. Prisma 7 requires an explicit driver adapter.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
