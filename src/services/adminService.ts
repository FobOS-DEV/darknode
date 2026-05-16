import { vpnService } from "./vpnService";
import type { VpnClientInput } from "./vpnService";
import { auditService } from "./auditService";
import { requestService } from "./requestService";
import { userService } from "./userService";
import { vpnGeneratorService } from "./vpnGeneratorService";
import { xraySyncService } from "./xraySyncService";
import { prisma } from "../db/prisma";
import { randomUUID } from "node:crypto";

function slugifyQuickLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "") || "manual";
}

function buildPlaceholderWhere() {
  return {
    OR: [
      { telegramId: { startsWith: "imported:" } },
      { telegramId: { startsWith: "manual:" } },
    ],
  };
}

const VPN_STATUS = {
  ACTIVE: "ACTIVE" as const,
  DISABLED: "DISABLED" as const,
};

export type AdminUserFilter = "all" | "active" | "expired" | "disabled" | "pending" | "manual" | "no_traffic";

export const adminService = {
  async addOrUpdateUser(actorUserId: number, input: VpnClientInput) {
    const client = await vpnService.upsertVpnClient(input);

    await auditService.log("admin.add_or_update_user", actorUserId, client.user.id, {
      telegramId: input.telegramId,
      displayName: input.displayName,
      expiresAt: input.expiresAt?.toISOString() ?? null,
    });
    await xraySyncService.syncAuthorizedClients();

    return client;
  },

  async setExpiry(actorUserId: number, telegramId: string, expiresAt: Date | null) {
    const client = await vpnService.setExpiry(telegramId, expiresAt);

    if (client) {
      await auditService.log("admin.set_expiry", actorUserId, client.user.id, {
        telegramId,
        expiresAt: expiresAt?.toISOString() ?? null,
      });
      await xraySyncService.syncAuthorizedClients();
    }

    return client;
  },

  async setDisabled(actorUserId: number, telegramId: string, disabled: boolean) {
    const client = await vpnService.setStatus(
      telegramId,
      disabled ? VPN_STATUS.DISABLED : VPN_STATUS.ACTIVE,
    );

    if (client) {
      await auditService.log(
        disabled ? "admin.disable_user" : "admin.enable_user",
        actorUserId,
        client.user.id,
        { telegramId },
      );
      await xraySyncService.syncAuthorizedClients();
    }

    return client;
  },

  async deleteClient(actorUserId: number, telegramId: string) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: {
        vpnClient: true,
        accessRequests: true,
      },
    });

    if (!user?.vpnClient) {
      return null;
    }

    const shouldDeleteUser =
      (user.telegramId.startsWith("manual:") || user.telegramId.startsWith("imported:")) &&
      !user.isAdmin &&
      user.accessRequests.length === 0;

    const deleted = await prisma.$transaction(async (tx) => {
      const deletedClient = await tx.vpnClient.delete({
        where: { id: user.vpnClient!.id },
      });

      if (shouldDeleteUser) {
        await tx.user.delete({
          where: { id: user.id },
        });
      }

      await tx.auditLog.create({
        data: {
          action: "admin.delete_client",
          actorUserId,
          targetUserId: shouldDeleteUser ? null : user.id,
          payloadJson: JSON.stringify({
            telegramId: user.telegramId,
            fullName: user.fullName,
            uuid: deletedClient.uuid,
            emailLabel: deletedClient.emailLabel,
            deletedUser: shouldDeleteUser,
          }),
        },
      });

      return {
        deletedClient,
        deletedUser: shouldDeleteUser,
        user,
      };
    });

    await xraySyncService.syncAuthorizedClients();

    return deleted;
  },

  async listUsers(filter: AdminUserFilter = "all") {
    const now = new Date();

    if (filter === "pending") {
      return prisma.user.findMany({
        where: {
          accessRequests: {
            some: {
              status: "PENDING",
            },
          },
        },
        include: {
          vpnClient: true,
          accessRequests: {
            where: { status: "PENDING" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    if (filter === "active") {
      return prisma.user.findMany({
        where: {
          vpnClient: {
            is: {
              status: "ACTIVE",
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          },
        },
        include: { vpnClient: true },
        orderBy: { createdAt: "desc" },
      });
    }

    if (filter === "expired") {
      return prisma.user.findMany({
        where: {
          vpnClient: {
            is: {
              status: { not: "DISABLED" },
              expiresAt: { not: null, lte: now },
            },
          },
        },
        include: { vpnClient: true },
        orderBy: { createdAt: "desc" },
      });
    }

    if (filter === "disabled") {
      return prisma.user.findMany({
        where: {
          vpnClient: {
            is: {
              status: "DISABLED",
            },
          },
        },
        include: { vpnClient: true },
        orderBy: { createdAt: "desc" },
      });
    }

    if (filter === "manual") {
      return prisma.user.findMany({
        where: {
          telegramId: {
            startsWith: "manual:",
          },
          vpnClient: {
            isNot: null,
          },
        },
        include: { vpnClient: true },
        orderBy: { createdAt: "desc" },
      });
    }

    if (filter === "no_traffic") {
      const users = await prisma.user.findMany({
        where: {
          vpnClient: {
            isNot: null,
          },
        },
        include: {
          vpnClient: true,
          trafficSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return users.filter((user) => {
        const latestSnapshot = user.trafficSnapshots[0];
        return !latestSnapshot || latestSnapshot.totalBytes <= 0;
      });
    }

    return vpnService.listUsersWithClients();
  },

  async listPendingRequests() {
    return requestService.listPendingRequests();
  },

  async listImportedClients() {
    return prisma.user.findMany({
      where: {
        ...buildPlaceholderWhere(),
        vpnClient: {
          isNot: null,
        },
      },
      include: {
        vpnClient: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  },

  async getUserInfo(telegramId: string) {
    return vpnService.getUserInfo(telegramId);
  },

  async getUserInfoById(id: number) {
    return prisma.user.findUnique({
      where: { id },
      include: { vpnClient: true },
    });
  },

  async bindImportedClient(actorUserId: number, targetTelegramId: string, lookup: string) {
    const normalizedLookup = lookup.trim().toLowerCase();

    const targetUser = await prisma.user.findUnique({
      where: { telegramId: targetTelegramId },
      include: { vpnClient: true },
    });

    if (!targetUser) {
      return { ok: false as const, reason: "target_not_found" as const };
    }

    if (targetUser.vpnClient) {
      return { ok: false as const, reason: "target_already_has_client" as const };
    }

    const importedUser = await prisma.user.findFirst({
      where: {
        ...buildPlaceholderWhere(),
        vpnClient: {
          isNot: null,
        },
        OR: [
          { telegramId: lookup.trim() },
          { vpnClient: { uuid: lookup.trim() } },
          { vpnClient: { emailLabel: lookup.trim() } },
          { vpnClient: { emailLabel: normalizedLookup } },
        ],
      },
      include: { vpnClient: true },
    });

    if (!importedUser?.vpnClient) {
      return { ok: false as const, reason: "imported_not_found" as const };
    }

    const client = await prisma.$transaction(async (tx) => {
      const movedClient = await tx.vpnClient.update({
        where: { id: importedUser.vpnClient!.id },
        data: { userId: targetUser.id },
        include: { user: true },
      });

      await tx.auditLog.create({
        data: {
          action: "admin.bind_imported_client",
          actorUserId,
          targetUserId: targetUser.id,
          payloadJson: JSON.stringify({
            targetTelegramId,
            importedUserId: importedUser.id,
            importedTelegramId: importedUser.telegramId,
            importedLookup: lookup.trim(),
            emailLabel: importedUser.vpnClient!.emailLabel,
            uuid: importedUser.vpnClient!.uuid,
          }),
        },
      });

      return movedClient;
    });

    await xraySyncService.syncAuthorizedClients();

    return {
      ok: true as const,
      client,
      importedUser,
    };
  },

  async bindImportedClientToRequest(actorUserId: number, requestId: number, importedUserId: number) {
    const request = await requestService.getRequestById(requestId);

    if (!request || request.status !== "PENDING") {
      return { ok: false as const, reason: "request_not_found" as const };
    }

    if (request.user.vpnClient) {
      return { ok: false as const, reason: "target_already_has_client" as const };
    }

    const importedUser = await prisma.user.findFirst({
      where: {
        id: importedUserId,
        ...buildPlaceholderWhere(),
        vpnClient: {
          isNot: null,
        },
      },
      include: { vpnClient: true },
    });

    if (!importedUser?.vpnClient) {
      return { ok: false as const, reason: "imported_not_found" as const };
    }

    const client = await prisma.$transaction(async (tx) => {
      const movedClient = await tx.vpnClient.update({
        where: { id: importedUser.vpnClient!.id },
        data: { userId: request.user.id },
        include: { user: true },
      });

      await tx.accessRequest.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          resolvedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: "admin.bind_imported_client_to_request",
          actorUserId,
          targetUserId: request.user.id,
          payloadJson: JSON.stringify({
            requestId,
            importedUserId: importedUser.id,
            importedTelegramId: importedUser.telegramId,
            emailLabel: importedUser.vpnClient!.emailLabel,
            uuid: importedUser.vpnClient!.uuid,
            targetTelegramId: request.user.telegramId,
          }),
        },
      });

      return movedClient;
    });

    await xraySyncService.syncAuthorizedClients();

    return {
      ok: true as const,
      client,
      importedUser,
      request,
    };
  },

  async approveRequest(actorUserId: number, requestId: number) {
    const request = await requestService.getRequestById(requestId);

    if (!request || request.status !== "PENDING") {
      return null;
    }

    const generatedClient = vpnGeneratorService.generateForUser({
      telegramId: request.user.telegramId,
      username: request.user.username ?? undefined,
      firstName: request.user.firstName ?? undefined,
      lastName: request.user.lastName ?? undefined,
      fullName: request.user.fullName,
    });

    const client = await vpnService.upsertVpnClient(generatedClient);
    await requestService.approveRequest(requestId);
    await xraySyncService.syncAuthorizedClients();

    await auditService.log("admin.approve_request", actorUserId, request.user.id, {
      requestId,
      telegramId: request.user.telegramId,
      expiresAt: client.expiresAt?.toISOString() ?? null,
    });

    return client;
  },

  async createQuickConfig(actorUserId: number, fullName: string) {
    const normalizedName = fullName.trim();
    const suffix = randomUUID().slice(0, 8);
    const telegramId = `manual:${slugifyQuickLabel(normalizedName)}:${suffix}`;

    const generatedClient = vpnGeneratorService.generateForUser({
      telegramId,
      fullName: normalizedName,
    });

    const client = await vpnService.upsertVpnClient({
      ...generatedClient,
      displayName: normalizedName,
      emailLabel: `manual-${suffix}`,
    });

    await auditService.log("admin.create_quick_config", actorUserId, client.user.id, {
      telegramId,
      fullName: normalizedName,
      expiresAt: client.expiresAt?.toISOString() ?? null,
    });
    await xraySyncService.syncAuthorizedClients();

    return client;
  },

  async rejectRequest(actorUserId: number, requestId: number) {
    const request = await requestService.getRequestById(requestId);

    if (!request || request.status !== "PENDING") {
      return null;
    }

    await requestService.rejectRequest(requestId);

    await auditService.log("admin.reject_request", actorUserId, request.user.id, {
      requestId,
      telegramId: request.user.telegramId,
    });

    return request;
  },

  async ensureAdminRecord(
    telegramId: string,
    username: string | undefined,
    firstName: string | undefined,
    lastName: string | undefined,
  ) {
    return userService.upsertUser(
      {
        telegramId,
        username,
        firstName,
        lastName,
        fullName: [firstName, lastName].filter(Boolean).join(" ") || username || telegramId,
      },
      true,
    );
  },
};
