import { prisma } from "../db/prisma";
import { logger } from "../config/logger";
import { auditService } from "./auditService";
import { xraySyncService } from "./xraySyncService";

const SWEEP_ACTION = "system.expire_client";

export type ExpiredClient = {
  vpnClientId: number;
  userId: number;
  telegramId: string;
  displayName: string;
  expiresAt: Date;
};

export const expirySweepService = {
  async sweep(actorUserId: number, now = new Date()) {
    const expiredClients = await prisma.vpnClient.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: {
          not: null,
          lt: now,
        },
      },
      include: {
        user: true,
      },
      orderBy: {
        expiresAt: "asc",
      },
    });

    if (expiredClients.length === 0) {
      return { expired: [] as ExpiredClient[], synced: false };
    }

    const expired: ExpiredClient[] = [];

    for (const client of expiredClients) {
      await prisma.vpnClient.update({
        where: { id: client.id },
        data: { status: "EXPIRED" },
      });

      await auditService.log(SWEEP_ACTION, actorUserId, client.user.id, {
        telegramId: client.user.telegramId,
        expiresAt: client.expiresAt?.toISOString() ?? null,
      });

      expired.push({
        vpnClientId: client.id,
        userId: client.user.id,
        telegramId: client.user.telegramId,
        displayName: client.displayName,
        expiresAt: client.expiresAt!,
      });
    }

    let synced = false;

    try {
      const result = await xraySyncService.syncAuthorizedClients();
      synced = result.skipped !== true;
    } catch (error) {
      logger.error({ error }, "Xray re-sync after expiry sweep failed");
    }

    logger.info(
      { expiredCount: expired.length, synced },
      "Expiry sweep completed",
    );

    return { expired, synced };
  },
};
