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

async function listAuthorizedClients(): Promise<AuthorizedClient[]> {
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

    const clients = await listAuthorizedClients();
    const results: PerInboundResult[] = [];

    for (const inbound of inbounds) {
      try {
        const outcome = await xrayGrpcService.syncAuthorizedClients(
          {
            inboundTag: inbound.inboundTag,
            xrayApiAddress: inbound.xrayApiAddress,
          },
          clients,
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
        clientCount: clients.length,
        failed: results.filter((result) => !result.ok).length,
      },
      "Synchronized Xray clients across inbounds",
    );

    return {
      skipped: false,
      applied: true,
      clientCount: clients.length,
      inboundCount: inbounds.length,
      results,
    };
  },
};
