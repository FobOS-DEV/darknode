import { randomBytes } from "node:crypto";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../db/prisma";
import { isExpired } from "../utils/dates";

function generateSubscriptionToken(): string {
  return randomBytes(32).toString("base64url");
}

type InboundForProfile = {
  id: number;
  label: string;
  inboundTag: string;
  host: string;
  port: number;
  sni: string;
  publicKey: string;
  shortId: string;
  flow: string;
  fingerprint: string;
  network: string;
  security: string;
  priority: number;
};

type VpnClientForProfile = {
  uuid: string;
  displayName: string;
  status: string;
  expiresAt: Date | null;
};

export type SubscriptionUserInfo = {
  uploadBytes: number;
  downloadBytes: number;
  expireUnix: number | null;
};

export type SubscriptionLookupResult =
  | { kind: "not_found" }
  | { kind: "revoked" }
  | {
      kind: "ok";
      content: string;
      inboundCount: number;
      userTelegramId: string;
      userInfo: SubscriptionUserInfo;
    };

function slugifyLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
}

function buildProfileLabel(client: VpnClientForProfile, inbound: InboundForProfile): string {
  const base = slugifyLabel(client.displayName) || "vpn";
  const suffix = slugifyLabel(inbound.label) || `inbound${inbound.id}`;
  return encodeURIComponent(`${base}_${suffix}`);
}

function buildVlessUrl(client: VpnClientForProfile, inbound: InboundForProfile): string {
  const query = new URLSearchParams({
    security: inbound.security,
    sni: inbound.sni,
    fp: inbound.fingerprint,
    pbk: inbound.publicKey,
    sid: inbound.shortId,
    type: inbound.network,
    flow: inbound.flow,
    encryption: "none",
  });

  const label = buildProfileLabel(client, inbound);
  return `vless://${client.uuid}@${inbound.host}:${inbound.port}?${query.toString()}#${label}`;
}

async function loadUserInfo(userId: number, expiresAt: Date | null): Promise<SubscriptionUserInfo> {
  const latest = await prisma.trafficSnapshot.findFirst({
    where: { userId },
    orderBy: { capturedAt: "desc" },
  });

  return {
    uploadBytes: latest ? Number(latest.uplinkBytes) : 0,
    downloadBytes: latest ? Number(latest.downlinkBytes) : 0,
    expireUnix: expiresAt ? Math.floor(expiresAt.getTime() / 1000) : null,
  };
}

async function loadVisibleInbounds(userId: number) {
  return prisma.inbound.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { visibility: { none: {} } },
        { visibility: { some: { userId } } },
      ],
    },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
  });
}

function isClientServiceable(client: VpnClientForProfile): boolean {
  if (client.status === "DISABLED") {
    return false;
  }

  if (client.status === "EXPIRED") {
    return false;
  }

  if (isExpired(client.expiresAt)) {
    return false;
  }

  return true;
}

export const subscriptionService = {
  async resolveByToken(token: string): Promise<SubscriptionLookupResult> {
    const subscription = await prisma.subscription.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            vpnClient: true,
          },
        },
      },
    });

    if (!subscription) {
      return { kind: "not_found" };
    }

    if (subscription.revokedAt) {
      return { kind: "revoked" };
    }

    void prisma.subscription
      .update({
        where: { id: subscription.id },
        data: { lastAccessedAt: new Date() },
      })
      .catch((error) => {
        logger.warn(
          { error, subscriptionId: subscription.id },
          "Failed to update subscription lastAccessedAt",
        );
      });

    const vpnClient = subscription.user.vpnClient;
    const userInfo = await loadUserInfo(subscription.user.id, vpnClient?.expiresAt ?? null);

    if (!vpnClient || !isClientServiceable(vpnClient)) {
      return {
        kind: "ok",
        content: "",
        inboundCount: 0,
        userTelegramId: subscription.user.telegramId,
        userInfo,
      };
    }

    const inbounds = await loadVisibleInbounds(subscription.user.id);

    if (inbounds.length === 0) {
      return {
        kind: "ok",
        content: "",
        inboundCount: 0,
        userTelegramId: subscription.user.telegramId,
        userInfo,
      };
    }

    const lines = inbounds.map((inbound) => buildVlessUrl(vpnClient, inbound));
    const content = Buffer.from(lines.join("\n"), "utf8").toString("base64");

    return {
      kind: "ok",
      content,
      inboundCount: inbounds.length,
      userTelegramId: subscription.user.telegramId,
      userInfo,
    };
  },

  buildPublicUrl(token: string): string {
    const base = env.subBaseUrl.replace(/\/+$/, "");
    return `${base}/sub/${token}`;
  },

  async ensureForUser(userId: number) {
    const existing = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (existing) {
      return existing;
    }

    return prisma.subscription.create({
      data: {
        userId,
        token: generateSubscriptionToken(),
      },
    });
  },

  async rotateForUser(userId: number) {
    return prisma.subscription.upsert({
      where: { userId },
      update: { token: generateSubscriptionToken(), revokedAt: null },
      create: { userId, token: generateSubscriptionToken() },
    });
  },

  async listVisibleInboundsForUser(userId: number) {
    return prisma.inbound.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { visibility: { none: {} } },
          { visibility: { some: { userId } } },
        ],
      },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
      select: {
        id: true,
        label: true,
        host: true,
        port: true,
      },
    });
  },
};
