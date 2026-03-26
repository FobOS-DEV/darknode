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

type SyncResult =
  | { skipped: true; reason: string }
  | { skipped: false; applied: true; clientCount: number };

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

    const clients = await listAuthorizedClients();

    await xrayGrpcService.syncAuthorizedClients(clients);

    logger.info({ clientCount: clients.length }, "Synchronized Xray clients over gRPC");

    return {
      skipped: false,
      applied: true,
      clientCount: clients.length,
    };
  },
};
