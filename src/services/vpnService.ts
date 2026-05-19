export type VpnStatusValue = "ACTIVE" | "EXPIRED" | "DISABLED";

import { prisma } from "../db/prisma";
import { isExpired } from "../utils/dates";
import { subscriptionService } from "./subscriptionService";

export type VpnClientInput = {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  displayName: string;
  emailLabel: string;
  uuid: string;
  vlessUrl: string;
  server: string;
  port: number;
  publicKey: string;
  shortId: string;
  sni: string;
  flow: string;
  expiresAt?: Date | null;
  isAdmin?: boolean;
};

type AccessClient = {
  id: number;
  userId: number;
  displayName: string;
  emailLabel: string;
  uuid: string;
  vlessUrl: string;
  server: string;
  port: number;
  publicKey: string;
  shortId: string;
  sni: string;
  flow: string;
  status: VpnStatusValue;
  createdAt: Date;
  expiresAt: Date | null;
  updatedAt: Date;
  user: { id: number; fullName: string };
};

export type UserAccessState =
  | { kind: "not_found" }
  | { kind: "inactive"; client: AccessClient }
  | { kind: "active"; client: AccessClient };

const VPN_STATUS = {
  ACTIVE: "ACTIVE" as VpnStatusValue,
  EXPIRED: "EXPIRED" as VpnStatusValue,
  DISABLED: "DISABLED" as VpnStatusValue,
};

async function refreshExpiredClient(clientId: number): Promise<void> {
  await prisma.vpnClient.update({
    where: { id: clientId },
    data: { status: VPN_STATUS.EXPIRED },
  });
}

export const vpnService = {
  async getUserAccessState(telegramId: string): Promise<UserAccessState> {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { vpnClient: true },
    });

    if (!user || !user.vpnClient) {
      return { kind: "not_found" };
    }

    const client: AccessClient = {
      ...user.vpnClient,
      status: user.vpnClient.status as VpnStatusValue,
      user: { id: user.id, fullName: user.fullName },
    };

    if (client.status === VPN_STATUS.DISABLED) {
      return { kind: "inactive", client };
    }

    if (isExpired(client.expiresAt)) {
      if (client.status !== VPN_STATUS.EXPIRED) {
        await refreshExpiredClient(client.id);
        client.status = VPN_STATUS.EXPIRED;
      }

      return { kind: "inactive", client };
    }

    if (client.status === VPN_STATUS.EXPIRED) {
      return { kind: "inactive", client };
    }

    return { kind: "active", client };
  },

  async upsertVpnClient(input: VpnClientInput) {
    const user = await prisma.user.upsert({
      where: { telegramId: input.telegramId },
      update: {
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        fullName: input.fullName,
        isAdmin: input.isAdmin ?? false,
      },
      create: {
        telegramId: input.telegramId,
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        fullName: input.fullName,
        isAdmin: input.isAdmin ?? false,
      },
    });

    const status = input.expiresAt && isExpired(input.expiresAt) ? VPN_STATUS.EXPIRED : VPN_STATUS.ACTIVE;

    const client = await prisma.vpnClient.upsert({
      where: { userId: user.id },
      update: {
        displayName: input.displayName,
        emailLabel: input.emailLabel,
        uuid: input.uuid,
        vlessUrl: input.vlessUrl,
        server: input.server,
        port: input.port,
        publicKey: input.publicKey,
        shortId: input.shortId,
        sni: input.sni,
        flow: input.flow,
        expiresAt: input.expiresAt ?? null,
        status,
      },
      create: {
        userId: user.id,
        displayName: input.displayName,
        emailLabel: input.emailLabel,
        uuid: input.uuid,
        vlessUrl: input.vlessUrl,
        server: input.server,
        port: input.port,
        publicKey: input.publicKey,
        shortId: input.shortId,
        sni: input.sni,
        flow: input.flow,
        expiresAt: input.expiresAt ?? null,
        status,
      },
      include: {
        user: true,
      },
    });

    await subscriptionService.ensureForUser(user.id);

    return client;
  },

  async setExpiry(telegramId: string, expiresAt: Date | null) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { vpnClient: true },
    });

    if (!user?.vpnClient) {
      return null;
    }

    const status = expiresAt && isExpired(expiresAt) ? VPN_STATUS.EXPIRED : VPN_STATUS.ACTIVE;

    return prisma.vpnClient.update({
      where: { userId: user.id },
      data: {
        expiresAt,
        status,
      },
      include: { user: true },
    });
  },

  async setStatus(telegramId: string, status: VpnStatusValue) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { vpnClient: true },
    });

    if (!user?.vpnClient) {
      return null;
    }

    return prisma.vpnClient.update({
      where: { userId: user.id },
      data: { status },
      include: { user: true },
    });
  },

  async getUserInfo(telegramId: string) {
    return prisma.user.findUnique({
      where: { telegramId },
      include: { vpnClient: true },
    });
  },

  async listUsersWithClients() {
    return prisma.user.findMany({
      include: { vpnClient: true },
      orderBy: { createdAt: "desc" },
    });
  },
};

