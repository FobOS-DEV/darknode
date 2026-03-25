import { callbacks } from "../../constants/callbacks";
import { messages } from "../../constants/messages";
import { adminService } from "../../services/adminService";
import type { VpnClientInput } from "../../services/vpnService";
import { TelegramBot } from "../../types/bot";
import { isAdminTelegramId } from "../../utils/auth";
import { formatDate } from "../../utils/dates";
import { createAdminMenuKeyboard } from "../keyboards/adminMenu";
import { getTelegramIdentity } from "./shared";

type AddUserField =
  | "telegramId"
  | "fullName"
  | "displayName"
  | "emailLabel"
  | "uuid"
  | "vlessUrl"
  | "server"
  | "port"
  | "publicKey"
  | "shortId"
  | "sni"
  | "flow"
  | "expiresAt";

type AddUserDraft = {
  telegramId?: string;
  fullName?: string;
  displayName?: string;
  emailLabel?: string;
  uuid?: string;
  vlessUrl?: string;
  server?: string;
  port?: number;
  publicKey?: string;
  shortId?: string;
  sni?: string;
  flow?: string;
  expiresAt?: Date | null;
};

type AddUserState = {
  kind: "adduser";
  step: AddUserField;
  draft: AddUserDraft;
};

type SetExpiryField = "telegramId" | "expiresAt";

type SetExpiryDraft = {
  telegramId?: string;
};

type SetExpiryState = {
  kind: "setexpiry";
  step: SetExpiryField;
  draft: SetExpiryDraft;
};

type ToggleState = {
  kind: "disable" | "enable";
};

type UserInfoState = {
  kind: "userinfo";
};

type AdminState = AddUserState | SetExpiryState | ToggleState | UserInfoState;

const addUserFieldOrder: AddUserField[] = [
  "telegramId",
  "fullName",
  "displayName",
  "emailLabel",
  "uuid",
  "vlessUrl",
  "server",
  "port",
  "publicKey",
  "shortId",
  "sni",
  "flow",
  "expiresAt",
];

const addUserPrompts: Record<AddUserField, string> = {
  telegramId: "Введите Telegram ID пользователя.",
  fullName: "Введите полное имя пользователя.",
  displayName: "Введите display name для VPN-клиента.",
  emailLabel: "Введите email label.",
  uuid: "Введите UUID клиента.",
  vlessUrl: "Вставьте полный VLESS URL.",
  server: "Введите адрес сервера.",
  port: "Введите порт, например 443.",
  publicKey: "Введите public key.",
  shortId: "Введите short id.",
  sni: "Введите SNI.",
  flow: "Введите flow, например xtls-rprx-vision.",
  expiresAt: "Введите дату окончания в формате YYYY-MM-DD или `none`.",
};

const setExpiryPrompts: Record<SetExpiryField, string> = {
  telegramId: "Введите Telegram ID пользователя.",
  expiresAt: "Введите новую дату окончания в формате YYYY-MM-DD или `none`.",
};

const adminStates = new Map<string, AdminState>();

function parseCommandArgs(text: string | undefined): string[] {
  if (!text) {
    return [];
  }

  return text.split(/\s+/).slice(1);
}

function getNextAddUserField(current: AddUserField): AddUserField | null {
  const currentIndex = addUserFieldOrder.indexOf(current);
  const nextIndex = currentIndex + 1;
  return addUserFieldOrder[nextIndex] ?? null;
}

function parseExpiryValue(value: string): { ok: true; value: Date | null } | { ok: false; error: string } {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, error: "Пустое значение не подходит. Попробуйте ещё раз." };
  }

  if (trimmed.toLowerCase() === "none") {
    return { ok: true, value: null };
  }

  const expiresAt = new Date(trimmed);

  if (Number.isNaN(expiresAt.getTime())) {
    return { ok: false, error: "Некорректная дата. Используйте формат YYYY-MM-DD или `none`." };
  }

  return { ok: true, value: expiresAt };
}

function parseAddUserValue(
  step: AddUserField,
  value: string,
): { ok: true; value: AddUserDraft[keyof AddUserDraft] } | { ok: false; error: string } {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, error: "Пустое значение не подходит. Попробуйте ещё раз." };
  }

  if (step === "port") {
    const port = Number(trimmed);

    if (!Number.isInteger(port)) {
      return { ok: false, error: "Порт должен быть целым числом." };
    }

    return { ok: true, value: port };
  }

  if (step === "expiresAt") {
    return parseExpiryValue(trimmed);
  }

  return { ok: true, value: trimmed };
}

function buildAddUserInput(draft: AddUserDraft): VpnClientInput {
  return {
    telegramId: draft.telegramId!,
    fullName: draft.fullName!,
    displayName: draft.displayName!,
    emailLabel: draft.emailLabel!,
    uuid: draft.uuid!,
    vlessUrl: draft.vlessUrl!,
    server: draft.server!,
    port: draft.port!,
    publicKey: draft.publicKey!,
    shortId: draft.shortId!,
    sni: draft.sni!,
    flow: draft.flow!,
    expiresAt: draft.expiresAt ?? null,
  };
}

async function getAdminIdentity(ctx: any) {
  const identity = getTelegramIdentity(ctx);

  if (!identity) {
    return null;
  }

  if (!isAdminTelegramId(BigInt(identity.telegramId))) {
    await ctx.reply(messages.adminOnly);
    return null;
  }

  const adminUser = await adminService.ensureAdminRecord(
    identity.telegramId,
    identity.username,
    identity.firstName,
    identity.lastName,
  );

  return { identity, adminUser };
}

async function sendAdminMenu(ctx: any) {
  await ctx.reply(
    [
      "Админ-команды:",
      "/adduser - пошаговое создание или обновление пользователя",
      "/setexpiry - изменить срок действия пошагово",
      "/disable - отключить пользователя пошагово",
      "/enable - включить пользователя пошагово",
      "/listusers",
      "/userinfo <telegram_id>",
      "/cancel - отменить активный сценарий",
    ].join("\n"),
    { reply_markup: createAdminMenuKeyboard() },
  );
}

async function startAddUserFlow(ctx: any, adminIdentity: { telegramId: string }) {
  adminStates.set(adminIdentity.telegramId, {
    kind: "adduser",
    step: "telegramId",
    draft: {},
  });

  await ctx.reply(
    [
      "Запускаю пошаговое добавление пользователя.",
      "Отправьте `/cancel`, если захотите отменить сценарий.",
      "",
      addUserPrompts.telegramId,
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}

async function startSetExpiryFlow(ctx: any, adminIdentity: { telegramId: string }) {
  adminStates.set(adminIdentity.telegramId, {
    kind: "setexpiry",
    step: "telegramId",
    draft: {},
  });

  await ctx.reply(
    [
      "Запускаю пошаговое изменение срока действия.",
      "Отправьте `/cancel`, если захотите отменить сценарий.",
      "",
      setExpiryPrompts.telegramId,
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}

async function startToggleFlow(ctx: any, adminIdentity: { telegramId: string }, kind: "disable" | "enable") {
  adminStates.set(adminIdentity.telegramId, { kind });

  await ctx.reply(
    [
      kind === "disable"
        ? "Запускаю пошаговое отключение пользователя."
        : "Запускаю пошаговое включение пользователя.",
      "Отправьте `/cancel`, если захотите отменить сценарий.",
      "",
      "Введите Telegram ID пользователя.",
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}

async function startUserInfoFlow(ctx: any, adminIdentity: { telegramId: string }) {
  adminStates.set(adminIdentity.telegramId, { kind: "userinfo" });

  await ctx.reply(
    [
      "Запускаю просмотр карточки пользователя.",
      "Отправьте `/cancel`, если захотите отменить сценарий.",
      "",
      "Введите Telegram ID пользователя.",
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}

async function handleAddUserState(
  ctx: any,
  admin: NonNullable<Awaited<ReturnType<typeof getAdminIdentity>>>,
  state: AddUserState,
  text: string,
) {
  const parsed = parseAddUserValue(state.step, text);

  if (!parsed.ok) {
    await ctx.reply(parsed.error, { parse_mode: "Markdown" });
    return true;
  }

  state.draft[state.step] = parsed.value as never;

  const nextStep = getNextAddUserField(state.step);

  if (!nextStep) {
    const client = await adminService.addOrUpdateUser(
      admin.adminUser.id,
      buildAddUserInput(state.draft),
    );

    adminStates.delete(admin.identity.telegramId);

    await ctx.reply(
      [
        `Пользователь сохранён: ${client.user.fullName}`,
        `Telegram ID: ${client.user.telegramId}`,
        `Статус: ${client.status.toLowerCase()}`,
        `Доступ до: ${formatDate(client.expiresAt)}`,
      ].join("\n"),
    );
    return true;
  }

  state.step = nextStep;
  adminStates.set(admin.identity.telegramId, state);

  await ctx.reply(addUserPrompts[nextStep], {
    parse_mode: "Markdown",
  });

  return true;
}

async function handleSetExpiryState(
  ctx: any,
  admin: NonNullable<Awaited<ReturnType<typeof getAdminIdentity>>>,
  state: SetExpiryState,
  text: string,
) {
  if (state.step === "telegramId") {
    state.draft.telegramId = text.trim();
    state.step = "expiresAt";
    adminStates.set(admin.identity.telegramId, state);

    await ctx.reply(setExpiryPrompts.expiresAt, {
      parse_mode: "Markdown",
    });

    return true;
  }

  const parsed = parseExpiryValue(text);

  if (!parsed.ok) {
    await ctx.reply(parsed.error, { parse_mode: "Markdown" });
    return true;
  }

  const client = await adminService.setExpiry(
    admin.adminUser.id,
    state.draft.telegramId!,
    parsed.value,
  );

  adminStates.delete(admin.identity.telegramId);

  if (!client) {
    await ctx.reply("Пользователь или VPN-клиент не найден.");
    return true;
  }

  await ctx.reply(`Новый срок действия: ${formatDate(client.expiresAt)}.`);
  return true;
}

async function handleToggleState(
  ctx: any,
  admin: NonNullable<Awaited<ReturnType<typeof getAdminIdentity>>>,
  state: ToggleState,
  text: string,
) {
  const telegramId = text.trim();

  if (!telegramId) {
    await ctx.reply("Введите Telegram ID пользователя.");
    return true;
  }

  const disabled = state.kind === "disable";
  const client = await adminService.setDisabled(admin.adminUser.id, telegramId, disabled);

  adminStates.delete(admin.identity.telegramId);

  if (!client) {
    await ctx.reply("Пользователь или VPN-клиент не найден.");
    return true;
  }

  await ctx.reply(`Статус обновлён: ${client.status.toLowerCase()}.`);
  return true;
}

async function handleUserInfoState(
  ctx: any,
  admin: NonNullable<Awaited<ReturnType<typeof getAdminIdentity>>>,
  text: string,
) {
  const telegramId = text.trim();

  if (!telegramId) {
    await ctx.reply("Введите Telegram ID пользователя.");
    return true;
  }

  const user = await adminService.getUserInfo(telegramId);

  adminStates.delete(admin.identity.telegramId);

  if (!user) {
    await ctx.reply("Пользователь не найден.");
    return true;
  }

  await ctx.reply(
    [
      `Имя: ${user.fullName}`,
      `Telegram ID: ${user.telegramId}`,
      `Username: ${user.username ?? "-"}`,
      `VPN статус: ${user.vpnClient?.status.toLowerCase() ?? "нет клиента"}`,
      `Доступ до: ${formatDate(user.vpnClient?.expiresAt ?? null)}`,
    ].join("\n"),
  );
  return true;
}

async function handleAdminFlowMessage(ctx: any) {
  const admin = await getAdminIdentity(ctx);

  if (!admin) {
    return false;
  }

  const state = adminStates.get(admin.identity.telegramId);

  if (!state) {
    return false;
  }

  const text = ctx.message?.text?.trim() ?? "";

  if (!text) {
    return true;
  }

  if (text.startsWith("/")) {
    if (text === "/cancel") {
      adminStates.delete(admin.identity.telegramId);
      await ctx.reply("Сценарий отменён.");
      return true;
    }

    await ctx.reply("Сейчас активен админский сценарий. Завершите его или отправьте `/cancel`.", {
      parse_mode: "Markdown",
    });
    return true;
  }

  if (state.kind === "adduser") {
    return handleAddUserState(ctx, admin, state, text);
  }

  if (state.kind === "setexpiry") {
    return handleSetExpiryState(ctx, admin, state, text);
  }

  if (state.kind === "userinfo") {
    return handleUserInfoState(ctx, admin, text);
  }

  return handleToggleState(ctx, admin, state, text);
}

export function registerAdminHandler(bot: TelegramBot) {
  bot.on("message:text", async (ctx, next) => {
    const wasHandled = await handleAdminFlowMessage(ctx);

    if (!wasHandled) {
      await next();
    }
  });

  bot.command("admin", async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    await sendAdminMenu(ctx);
  });

  bot.command("adduser", async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    await startAddUserFlow(ctx, admin.identity);
  });

  bot.command("setexpiry", async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    const [telegramId, rawDate] = parseCommandArgs(ctx.message?.text);

    if (telegramId && rawDate) {
      const parsed = parseExpiryValue(rawDate);

      if (!parsed.ok) {
        await ctx.reply(parsed.error, { parse_mode: "Markdown" });
        return;
      }

      const client = await adminService.setExpiry(admin.adminUser.id, telegramId, parsed.value);

      if (!client) {
        await ctx.reply("Пользователь или VPN-клиент не найден.");
        return;
      }

      await ctx.reply(`Новый срок действия: ${formatDate(client.expiresAt)}.`);
      return;
    }

    await startSetExpiryFlow(ctx, admin.identity);
  });

  bot.command(["disable", "enable"], async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    const [telegramId] = parseCommandArgs(ctx.message?.text);
    const commandKind = ctx.message?.text?.startsWith("/disable") ? "disable" : "enable";

    if (telegramId) {
      const client = await adminService.setDisabled(
        admin.adminUser.id,
        telegramId,
        commandKind === "disable",
      );

      if (!client) {
        await ctx.reply("Пользователь или VPN-клиент не найден.");
        return;
      }

      await ctx.reply(`Статус обновлён: ${client.status.toLowerCase()}.`);
      return;
    }

    await startToggleFlow(ctx, admin.identity, commandKind);
  });

  bot.command("cancel", async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    if (!adminStates.has(admin.identity.telegramId)) {
      await ctx.reply("Активного сценария сейчас нет.");
      return;
    }

    adminStates.delete(admin.identity.telegramId);
    await ctx.reply("Сценарий отменён.");
  });

  bot.command("listusers", async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    const users = await adminService.listUsers();

    if (users.length === 0) {
      await ctx.reply("Пользователей пока нет.");
      return;
    }

    await ctx.reply(
      users
        .map((user: { fullName: string; telegramId: string; vpnClient: { status: string } | null }) => {
          const status = user.vpnClient?.status.toLowerCase() ?? "no-client";
          return `${user.fullName} | tg=${user.telegramId} | ${status}`;
        })
        .join("\n"),
    );
  });

  bot.command("userinfo", async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    const [telegramId] = parseCommandArgs(ctx.message?.text);

    if (!telegramId) {
      await startUserInfoFlow(ctx, admin.identity);
      return;
    }

    const user = await adminService.getUserInfo(telegramId);

    if (!user) {
      await ctx.reply("Пользователь не найден.");
      return;
    }

    await ctx.reply(
      [
        `Имя: ${user.fullName}`,
        `Telegram ID: ${user.telegramId}`,
        `Username: ${user.username ?? "-"}`,
        `VPN статус: ${user.vpnClient?.status.toLowerCase() ?? "нет клиента"}`,
        `Доступ до: ${formatDate(user.vpnClient?.expiresAt ?? null)}`,
      ].join("\n"),
    );
  });

  bot.callbackQuery(callbacks.adminAddUser, async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    await ctx.answerCallbackQuery();
    await startAddUserFlow(ctx, admin.identity);
  });

  bot.callbackQuery(callbacks.adminSetExpiry, async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    await ctx.answerCallbackQuery();
    await startSetExpiryFlow(ctx, admin.identity);
  });

  bot.callbackQuery(callbacks.adminDisable, async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    await ctx.answerCallbackQuery();
    await startToggleFlow(ctx, admin.identity, "disable");
  });

  bot.callbackQuery(callbacks.adminEnable, async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    await ctx.answerCallbackQuery();
    await startToggleFlow(ctx, admin.identity, "enable");
  });

  bot.callbackQuery(callbacks.adminListUsers, async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    await ctx.answerCallbackQuery();

    const users = await adminService.listUsers();

    if (users.length === 0) {
      await ctx.reply("Пользователей пока нет.");
      return;
    }

    await ctx.reply(
      users
        .map((user: { fullName: string; telegramId: string; vpnClient: { status: string } | null }) => {
          const status = user.vpnClient?.status.toLowerCase() ?? "no-client";
          return `${user.fullName} | tg=${user.telegramId} | ${status}`;
        })
        .join("\n"),
    );
  });

  bot.callbackQuery(callbacks.adminUserInfo, async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    await ctx.answerCallbackQuery();
    await startUserInfoFlow(ctx, admin.identity);
  });
}
