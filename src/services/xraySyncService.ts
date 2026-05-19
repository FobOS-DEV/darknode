import { logger } from "../config/logger";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { isExpired } from "../utils/dates";
import { xrayGrpcService } from "./xrayGrpcService";

type AuthorizedClient = {
  uuid: string;
  emailLabel: string;
  flow: string;
};

type PerInboundResult = {
  inboundId: number;
  inboundTag: string;
  ok: boolean;
  remoteCount?: number;
  desiredCount?: number;
  removed?: number;
  added?: number;
  error?: string;
};

type SyncResult =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      applied: true;
      clientCount: number;
      inboundCount: number;
      results: PerInboundResult[];
    };

async function listAllAuthorizedClients(): Promise<AuthorizedClient[]> {
  const clients = await prisma.vpnClient.findMany({
    where: {
      status: "ACTIVE",
    },
    orderBy: {
      id: "asc",
    },
  });

  return clients
    .filter((client) => !isExpired(client.expiresAt))
    .map((client) => ({
      uuid: client.uuid,
      emailLabel: client.emailLabel,
      flow: client.flow,
    }));
}

async function listAuthorizedClientsForInbound(
  inboundId: number,
  fallback: AuthorizedClient[],
): Promise<AuthorizedClient[]> {
  const allowedUsers = await prisma.inboundUser.findMany({
    where: { inboundId },
    select: { userId: true },
  });

  if (allowedUsers.length === 0) {
    return fallback;
  }

  const allowedUserIds = new Set(allowedUsers.map((entry) => entry.userId));

  const clients = await prisma.vpnClient.findMany({
    where: {
      status: "ACTIVE",
      userId: { in: Array.from(allowedUserIds) },
    },
    orderBy: { id: "asc" },
  });

  return clients
    .filter((client) => !isExpired(client.expiresAt))
    .map((client) => ({
      uuid: client.uuid,
      emailLabel: client.emailLabel,
      flow: client.flow,
    }));
}

async function listActiveInbounds() {
  return prisma.inbound.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
  });
}

export const xraySyncService = {
  isEnabled() {
    return env.xraySyncEnabled && xrayGrpcService.isEnabled();
  },

  async syncAuthorizedClients(): Promise<SyncResult> {
    if (!env.xraySyncEnabled) {
      return { skipped: true, reason: "XRAY_SYNC_ENABLED is false" };
    }

    if (!xrayGrpcService.isEnabled()) {
      return { skipped: true, reason: "XRAY_HOT_SYNC_ENABLED is false" };
    }

    const inbounds = await listActiveInbounds();

    if (inbounds.length === 0) {
      logger.warn("No ACTIVE Inbound rows found; skipping Xray sync");
      return { skipped: true, reason: "no ACTIVE Inbound rows" };
    }

    const sharedClients = await listAllAuthorizedClients();
    const results: PerInboundResult[] = [];

    for (const inbound of inbounds) {
      try {
        const targetClients = await listAuthorizedClientsForInbound(inbound.id, sharedClients);
        const outcome = await xrayGrpcService.syncAuthorizedClients(
          {
            inboundTag: inbound.inboundTag,
            xrayApiAddress: inbound.xrayApiAddress,
          },
          targetClients,
        );

        results.push({
          inboundId: inbound.id,
          inboundTag: inbound.inboundTag,
          ok: true,
          ...outcome,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          { error, inboundId: inbound.id, inboundTag: inbound.inboundTag },
          "Failed to sync Inbound via gRPC",
        );
        results.push({
          inboundId: inbound.id,
          inboundTag: inbound.inboundTag,
          ok: false,
          error: message,
        });
      }
    }

    logger.info(
      {
        inboundCount: inbounds.length,
        clientCount: sharedClients.length,
        failed: results.filter((result) => !result.ok).length,
      },
      "Synchronized Xray clients across inbounds",
    );

    return {
      skipped: false,
      applied: true,
      clientCount: sharedClients.length,
      inboundCount: inbounds.length,
      results,
    };
  },
};
