import { prisma } from "../db/prisma";

export const auditService = {
  async log(action: string, actorUserId: number, targetUserId?: number, payload?: unknown) {
    await prisma.auditLog.create({
      data: {
        action,
        actorUserId,
        targetUserId,
        payloadJson: payload ? JSON.stringify(payload) : null,
      },
    });
  },
};

