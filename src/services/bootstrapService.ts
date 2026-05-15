import { env } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../db/prisma";
import { subscriptionService } from "./subscriptionService";

async function ensureEnvBootstrapInbound() {
  const existing = await prisma.inbound.findUnique({
    where: { inboundTag: env.xrayInboundTag },
  });

  if (existing) {
    return existing;
  }

  const created = await prisma.inbound.create({
    data: {
      label: "Default (env bootstrap)",
      inboundTag: env.xrayInboundTag,
      host: env.vpnServerHost,
      port: env.vpnServerPort,
      sni: env.vpnSni,
      publicKey: env.vpnPublicKey,
      shortId: env.vpnShortId,
      flow: env.vpnFlow,
      fingerprint: env.vpnFingerprint,
      xrayApiAddress: env.xrayApiAddress,
      status: "ACTIVE",
      priority: 0,
    },
  });

  logger.info(
    {
      inboundId: created.id,
      inboundTag: created.inboundTag,
      host: created.host,
      port: created.port,
    },
    "Seeded bootstrap Inbound from env",
  );

  return created;
}

async function backfillVpnClientInbound(inboundId: number) {
  const result = await prisma.vpnClient.updateMany({
    where: { inboundId: null },
    data: { inboundId },
  });

  if (result.count > 0) {
    logger.info({ count: result.count, inboundId }, "Backfilled VpnClient.inboundId");
  }

  return result.count;
}

async function backfillSubscriptions() {
  const usersMissingSubscription = await prisma.user.findMany({
    where: { subscription: null },
    select: { id: true },
  });

  if (usersMissingSubscription.length === 0) {
    return 0;
  }

  for (const user of usersMissingSubscription) {
    await subscriptionService.ensureForUser(user.id);
  }

  logger.info(
    { count: usersMissingSubscription.length },
    "Generated subscription tokens for existing users",
  );

  return usersMissingSubscription.length;
}

export const bootstrapService = {
  async run() {
    const inbound = await ensureEnvBootstrapInbound();
    const backfilledClients = await backfillVpnClientInbound(inbound.id);
    const newSubscriptions = await backfillSubscriptions();

    return {
      inboundId: inbound.id,
      backfilledClients,
      newSubscriptions,
    };
  },
};
