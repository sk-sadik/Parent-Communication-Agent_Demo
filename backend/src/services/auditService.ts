// Append-only audit trail. Every important action goes through this helper so
// there is exactly one place that writes audit rows.

import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import type { AuditActorType } from "../generated/prisma/enums.js";

export interface AuditEntry {
  instituteId: string;
  actorType: AuditActorType;
  actorId: string | null;
  action: string;
  details?: Record<string, string | number | boolean | null>;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: randomUUID(),
      institute_id: entry.instituteId,
      actor_type: entry.actorType,
      actor_id: entry.actorId,
      action: entry.action,
      details: entry.details ?? {},
    },
  });
}
