import { prisma } from "../db/prisma";
import { logger } from "../config/logger";
import { xrayStatsService } from "./xrayStatsService";

type SnapshotDelta = {
  fromCapturedAt: Date;
  toCapturedAt: Date;
  uplinkBytes: number;
  downlinkBytes: number;
  totalBytes: number;
};

function clampDelta(current: number, previous: number): number {
  return Math.max(0, current - previous);
}

export const trafficSnapshotService = {
  async collectSnapshots() {
    const users = await prisma.user.findMany({
      where: {
        vpnClient: {
          isNot: null,
        },
      },
      include: {
        vpnClient: true,
      },
    });

    if (users.length === 0) {
      return { capturedCount: 0, skippedCount: 0 };
    }

    const allTraffic = await xrayStatsService.getAllUserTraffic();
    let capturedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      if (!user.vpnClient) {
        skippedCount += 1;
        continue;
      }

      const stats = allTraffic[user.vpnClient.emailLabel];

      if (!stats) {
        skippedCount += 1;
        continue;
      }

      await prisma.trafficSnapshot.create({
        data: {
          userId: user.id,
          vpnClientId: user.vpnClient.id,
          uplinkBytes: stats.uplinkBytes,
          downlinkBytes: stats.downlinkBytes,
          totalBytes: stats.totalBytes,
        },
      });

      capturedCount += 1;
    }

    logger.info({ capturedCount, skippedCount }, "Captured traffic snapshots");
    return { capturedCount, skippedCount };
  },

  async getLatestSnapshot(userId: number) {
    return prisma.trafficSnapshot.findFirst({
      where: { userId },
      orderBy: { capturedAt: "desc" },
    });
  },

  async getDeltaForLastHours(userId: number, hours: number): Promise<SnapshotDelta | null> {
    const latest = await prisma.trafficSnapshot.findFirst({
      where: { userId },
      orderBy: { capturedAt: "desc" },
    });

    if (!latest) {
      return null;
    }

    const fromDate = new Date(latest.capturedAt.getTime() - hours * 60 * 60 * 1000);
    const baseline =
      (await prisma.trafficSnapshot.findFirst({
        where: {
          userId,
          capturedAt: {
            gte: fromDate,
            lte: latest.capturedAt,
          },
        },
        orderBy: { capturedAt: "asc" },
      })) ?? latest;

    return {
      fromCapturedAt: baseline.capturedAt,
      toCapturedAt: latest.capturedAt,
      uplinkBytes: clampDelta(latest.uplinkBytes, baseline.uplinkBytes),
      downlinkBytes: clampDelta(latest.downlinkBytes, baseline.downlinkBytes),
      totalBytes: clampDelta(latest.totalBytes, baseline.totalBytes),
    };
  },
};
