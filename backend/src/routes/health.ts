import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";

type DbState = "connected" | "disconnected";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    let db: DbState = "disconnected";

    try {
      // Real round-trip to Postgres, not a cached flag.
      await prisma.$queryRaw`SELECT 1`;
      db = "connected";
    } catch (error) {
      // Log only the message. Errors must never expose the connection string.
      const message = error instanceof Error ? error.message : "unknown error";
      app.log.error(`Health check database probe failed: ${message}`);
    }

    return reply.code(db === "connected" ? 200 : 503).send({
      status: db === "connected" ? "ok" : "degraded",
      db,
      timestamp: new Date().toISOString(),
    });
  });
}
