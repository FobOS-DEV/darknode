import { vpnService } from "./vpnService";
import type { VpnClientInput } from "./vpnService";
import { auditService } from "./auditService";
import { userService } from "./userService";

const VPN_STATUS = {
  ACTIVE: "ACTIVE" as const,
  DISABLED: "DISABLED" as const,
};

export const adminService = {
  async addOrUpdateUser(actorUserId: number, input: VpnClientInput) {
    const client = await vpnService.upsertVpnClient(input);

    await auditService.log("admin.add_or_update_user", actorUserId, client.user.id, {
      telegramId: input.telegramId,
      displayName: input.displayName,
      expiresAt: input.expiresAt?.toISOString() ?? null,
    });

    return client;
  },

  async setExpiry(actorUserId: number, telegramId: string, expiresAt: Date | null) {
    const client = await vpnService.setExpiry(telegramId, expiresAt);

    if (client) {
      await auditService.log("admin.set_expiry", actorUserId, client.user.id, {
        telegramId,
        expiresAt: expiresAt?.toISOString() ?? null,
      });
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
    }

    return client;
  },

  async listUsers() {
    return vpnService.listUsersWithClients();
  },

  async getUserInfo(telegramId: string) {
    return vpnService.getUserInfo(telegramId);
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

