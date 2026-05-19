import { InlineKeyboard } from "grammy";

import { callbacks } from "../../constants/callbacks";
import type { AdminUserFilter } from "../../services/adminService";

type UserPickerAction = "userinfo" | "setexpiry" | "disable" | "enable";

export const USER_PICKER_PAGE_SIZE = 15;

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
    .text("Инбаунды", callbacks.adminInbounds)
    .text("Сгенерировать конфиг", callbacks.adminGenerateUser)
    .row()
    .text("Импорт конфига", callbacks.adminAddUser);
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
    id: number;
    fullName: string;
    telegramId: string;
    vpnClient: { status: string } | null;
  }>,
  filter: AdminUserFilter,
  page: number,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const prefix = getUserPickerPrefix(action);
  const totalPages = Math.max(1, Math.ceil(users.length / USER_PICKER_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * USER_PICKER_PAGE_SIZE;
  const slice = users.slice(start, start + USER_PICKER_PAGE_SIZE);

  for (const user of slice) {
    const status = user.vpnClient?.status?.toLowerCase() ?? "no-client";
    keyboard
      .text(`${user.fullName} • ${status}`, `${prefix}${user.id}`)
      .row();
  }

  if (totalPages > 1) {
    const navPrefix = callbacks.adminPickerNavPrefix;

    if (safePage > 0) {
      keyboard.text("←", `${navPrefix}${action}:${filter}:${safePage - 1}`);
    }

    keyboard.text(`${safePage + 1}/${totalPages}`, `${navPrefix}noop:${action}:${safePage}`);

    if (safePage < totalPages - 1) {
      keyboard.text("→", `${navPrefix}${action}:${filter}:${safePage + 1}`);
    }

    keyboard.row();
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

export function createExpiryOptionsKeyboard(userId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("+30 дней", `${callbacks.adminSetExpiryPlus30Prefix}${userId}`)
    .text("+60 дней", `${callbacks.adminSetExpiryPlus60Prefix}${userId}`)
    .row()
    .text("+90 дней", `${callbacks.adminSetExpiryPlus90Prefix}${userId}`)
    .text("Ввести дату вручную", `${callbacks.adminSetExpiryManualPrefix}${userId}`);
}
