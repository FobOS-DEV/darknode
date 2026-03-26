import { InlineKeyboard } from "grammy";

import { callbacks } from "../../constants/callbacks";
import type { AdminUserFilter } from "../../services/adminService";

type UserPickerAction = "userinfo" | "setexpiry" | "disable" | "enable";

function getUserPickerPrefix(action: UserPickerAction): string {
  if (action === "userinfo") {
    return callbacks.adminPickUserInfoPrefix;
  }

  if (action === "setexpiry") {
    return callbacks.adminPickSetExpiryPrefix;
  }

  if (action === "disable") {
    return callbacks.adminPickDisablePrefix;
  }

  return callbacks.adminPickEnablePrefix;
}

export function createAdminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Заявки", callbacks.adminRequests)
    .text("Список", callbacks.adminListUsers)
    .row()
    .text("Импорт", callbacks.adminImported)
    .text("Привязка", callbacks.adminBindClient)
    .row()
    .text("Срок", callbacks.adminSetExpiry)
    .text("Карточка", callbacks.adminUserInfo)
    .row()
    .text("Отключить", callbacks.adminDisable)
    .text("Включить", callbacks.adminEnable)
    .row()
    .text("Ручное добавление", callbacks.adminAddUser);
}

export function createPendingRequestsKeyboard(
  requests: Array<{ id: number; user: { fullName: string; telegramId: string } }>,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const request of requests.slice(0, 20)) {
    keyboard
      .text(
        `${request.user.fullName} • ${request.user.telegramId}`,
        `${callbacks.adminRequestViewPrefix}${request.id}`,
      )
      .row();
  }

  return keyboard;
}

export function createRequestDecisionKeyboard(requestId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Одобрить новый", `${callbacks.adminRequestApprovePrefix}${requestId}`)
    .text("Привязать существующий", `${callbacks.adminRequestBindPrefix}${requestId}`)
    .row()
    .text("Отклонить", `${callbacks.adminRequestRejectPrefix}${requestId}`);
}

export function createImportedClientsForRequestKeyboard(
  requestId: number,
  clients: Array<{ id: number; vpnClient: { emailLabel: string; uuid: string } | null }>,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const clientUser of clients.slice(0, 20)) {
    if (!clientUser.vpnClient) {
      continue;
    }

    keyboard
      .text(
        `${clientUser.vpnClient.emailLabel} • ${clientUser.vpnClient.uuid.slice(0, 8)}`,
        `${callbacks.adminRequestBindSelectPrefix}${requestId}:${clientUser.id}`,
      )
      .row();
  }

  return keyboard;
}

export function createUserPickerKeyboard(
  action: UserPickerAction,
  users: Array<{
    fullName: string;
    telegramId: string;
    vpnClient: { status: string } | null;
  }>,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const prefix = getUserPickerPrefix(action);

  for (const user of users.slice(0, 20)) {
    const status = user.vpnClient?.status?.toLowerCase() ?? "no-client";
    keyboard
      .text(
        `${user.fullName} • ${status}`,
        `${prefix}${user.telegramId}`,
      )
      .row();
  }

  return keyboard;
}

export function createUserFilterKeyboard(action: "userinfo" | "listusers"): InlineKeyboard {
  const prefix =
    action === "userinfo"
      ? callbacks.adminUserFilterPrefix
      : callbacks.adminListUsersFilterPrefix;

  return new InlineKeyboard()
    .text("Все", `${prefix}all`)
    .text("Active", `${prefix}active`)
    .row()
    .text("Expired", `${prefix}expired`)
    .text("Disabled", `${prefix}disabled`)
    .row()
    .text("Pending", `${prefix}pending`);
}

export function formatFilterLabel(filter: AdminUserFilter): string {
  if (filter === "active") {
    return "active";
  }

  if (filter === "expired") {
    return "expired";
  }

  if (filter === "disabled") {
    return "disabled";
  }

  if (filter === "pending") {
    return "pending";
  }

  return "all";
}

export function createExpiryOptionsKeyboard(telegramId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("+30 дней", `${callbacks.adminSetExpiryPlus30Prefix}${telegramId}`)
    .text("+60 дней", `${callbacks.adminSetExpiryPlus60Prefix}${telegramId}`)
    .row()
    .text("+90 дней", `${callbacks.adminSetExpiryPlus90Prefix}${telegramId}`)
    .text("Ввести дату вручную", `${callbacks.adminSetExpiryManualPrefix}${telegramId}`);
}
