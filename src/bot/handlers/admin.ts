import { callbacks } from "../../constants/callbacks";
import { messages } from "../../constants/messages";
import { adminService, type AdminUserFilter } from "../../services/adminService";
import { requestService } from "../../services/requestService";
import { trafficSnapshotService } from "../../services/trafficSnapshotService";
import { xrayStatsService } from "../../services/xrayStatsService";
import type { VpnClientInput } from "../../services/vpnService";
import { TelegramBot } from "../../types/bot";
import { isAdminTelegramId } from "../../utils/auth";
import { formatDate } from "../../utils/dates";
import {
  createAdminMenuKeyboard,
  createExpiryOptionsKeyboard,
  createUserFilterKeyboard,
  createImportedClientsForRequestKeyboard,
  createPendingRequestsKeyboard,
  createRequestDecisionKeyboard,
  createUserPickerKeyboard,
  formatFilterLabel,
} from "../keyboards/adminMenu";
import { createContactKeyboard, createMainMenuKeyboard } from "../keyboards/mainMenu";
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
type SetExpiryState = {
  kind: "setexpiry";
  step: SetExpiryField;
  draft: { telegramId?: string };
};

type ToggleState = {
  kind: "disable" | "enable";
};

type UserInfoState = {
  kind: "userinfo";
};

type BindClientField = "telegramId" | "lookup";
type BindClientState = {
  kind: "bindclient";
  step: BindClientField;
  draft: { telegramId?: string };
};

type AdminState = AddUserState | SetExpiryState | ToggleState | UserInfoState | BindClientState;

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
  telegramId: "Р’РІРµРґРёС‚Рµ Telegram ID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.",
  fullName: "Р’РІРµРґРёС‚Рµ РїРѕР»РЅРѕРµ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.",
  displayName: "Р’РІРµРґРёС‚Рµ display name РґР»СЏ VPN-РєР»РёРµРЅС‚Р°.",
  emailLabel: "Р’РІРµРґРёС‚Рµ email label.",
  uuid: "Р’РІРµРґРёС‚Рµ UUID РєР»РёРµРЅС‚Р°.",
  vlessUrl: "Р’СЃС‚Р°РІСЊС‚Рµ РїРѕР»РЅС‹Р№ VLESS URL.",
  server: "Р’РІРµРґРёС‚Рµ Р°РґСЂРµСЃ СЃРµСЂРІРµСЂР°.",
  port: "Р’РІРµРґРёС‚Рµ РїРѕСЂС‚, РЅР°РїСЂРёРјРµСЂ 443.",
  publicKey: "Р’РІРµРґРёС‚Рµ public key.",
  shortId: "Р’РІРµРґРёС‚Рµ short id.",
  sni: "Р’РІРµРґРёС‚Рµ SNI.",
  flow: "Р’РІРµРґРёС‚Рµ flow, РЅР°РїСЂРёРјРµСЂ xtls-rprx-vision.",
  expiresAt: "Р’РІРµРґРёС‚Рµ РґР°С‚Сѓ РѕРєРѕРЅС‡Р°РЅРёСЏ РІ С„РѕСЂРјР°С‚Рµ YYYY-MM-DD РёР»Рё `none`.",
};

const setExpiryPrompts: Record<SetExpiryField, string> = {
  telegramId: "Р’РІРµРґРёС‚Рµ Telegram ID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.",
  expiresAt: "Р’РІРµРґРёС‚Рµ РЅРѕРІСѓСЋ РґР°С‚Сѓ РѕРєРѕРЅС‡Р°РЅРёСЏ РІ С„РѕСЂРјР°С‚Рµ YYYY-MM-DD РёР»Рё `none`.",
};

const bindClientPrompts: Record<BindClientField, string> = {
  telegramId: "Р’РІРµРґРёС‚Рµ Telegram ID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ, Рє РєРѕС‚РѕСЂРѕРјСѓ РЅСѓР¶РЅРѕ РїСЂРёРІСЏР·Р°С‚СЊ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёР№ РєР»РёРµРЅС‚.",
  lookup: "Р’РІРµРґРёС‚Рµ email label, UUID РёР»Рё imported:... РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ РєР»РёРµРЅС‚Р°.",
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
  return addUserFieldOrder[currentIndex + 1] ?? null;
}

function parseExpiryValue(value: string): { ok: true; value: Date | null } | { ok: false; error: string } {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, error: "РџСѓСЃС‚РѕРµ Р·РЅР°С‡РµРЅРёРµ РЅРµ РїРѕРґС…РѕРґРёС‚. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰С‘ СЂР°Р·." };
  }

  if (trimmed.toLowerCase() === "none") {
    return { ok: true, value: null };
  }

  const expiresAt = new Date(trimmed);

  if (Number.isNaN(expiresAt.getTime())) {
    return { ok: false, error: "РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ РґР°С‚Р°. РСЃРїРѕР»СЊР·СѓР№С‚Рµ С„РѕСЂРјР°С‚ YYYY-MM-DD РёР»Рё `none`." };
  }

  return { ok: true, value: expiresAt };
}

function parseAddUserValue(
  step: AddUserField,
  value: string,
): { ok: true; value: AddUserDraft[keyof AddUserDraft] } | { ok: false; error: string } {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, error: "РџСѓСЃС‚РѕРµ Р·РЅР°С‡РµРЅРёРµ РЅРµ РїРѕРґС…РѕРґРёС‚. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰С‘ СЂР°Р·." };
  }

  if (step === "port") {
    const port = Number(trimmed);

    if (!Number.isInteger(port)) {
      return { ok: false, error: "РџРѕСЂС‚ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ С†РµР»С‹Рј С‡РёСЃР»РѕРј." };
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
      "РђРґРјРёРЅ-РєРѕРјР°РЅРґС‹:",
      "/requests - СЃРїРёСЃРѕРє РЅРѕРІС‹С… Р·Р°СЏРІРѕРє",
      "/imported - СЃРїРёСЃРѕРє РёРјРїРѕСЂС‚РёСЂРѕРІР°РЅРЅС‹С… РєР»РёРµРЅС‚РѕРІ",
      "/bindclient - РїСЂРёРІСЏР·Р°С‚СЊ imported-РєР»РёРµРЅС‚Р° Рє СЂРµР°Р»СЊРЅРѕРјСѓ Telegram ID",
      "/adduser - СЂСѓС‡РЅРѕРµ РґРѕР±Р°РІР»РµРЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ",
      "/setexpiry - РёР·РјРµРЅРёС‚СЊ СЃСЂРѕРє РґРµР№СЃС‚РІРёСЏ",
      "/disable - РѕС‚РєР»СЋС‡РёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ",
      "/enable - РІРєР»СЋС‡РёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ",
      "/listusers - РІСЃРµ РїРѕР»СЊР·РѕРІР°С‚РµР»Рё",
      "/userinfo <telegram_id> - РєР°СЂС‚РѕС‡РєР° РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ",
      "/cancel - РѕС‚РјРµРЅРёС‚СЊ Р°РєС‚РёРІРЅС‹Р№ СЃС†РµРЅР°СЂРёР№",
    ].join("\n"),
    { reply_markup: createAdminMenuKeyboard() },
  );
}

async function sendPendingRequests(ctx: any) {
  const requests = await adminService.listPendingRequests();

  if (requests.length === 0) {
    await ctx.reply("РќРѕРІС‹С… Р·Р°СЏРІРѕРє СЃРµР№С‡Р°СЃ РЅРµС‚.");
    return;
  }

  await ctx.reply("РќРѕРІС‹Рµ Р·Р°СЏРІРєРё:", {
    reply_markup: createPendingRequestsKeyboard(requests),
  });
}

async function sendImportedClients(ctx: any) {
  const importedClients = await adminService.listImportedClients();

  if (importedClients.length === 0) {
    await ctx.reply("РЎРІРѕР±РѕРґРЅС‹С… imported-РєР»РёРµРЅС‚РѕРІ СЃРµР№С‡Р°СЃ РЅРµС‚.");
    return;
  }

  await ctx.reply(
    importedClients
      .slice(0, 30)
      .map((user) => {
        const client = user.vpnClient!;
        return `${client.emailLabel} | uuid=${client.uuid} | placeholder=${user.telegramId}`;
      })
      .join("\n"),
  );
}

async function sendImportedClientsForRequest(ctx: any, requestId: number) {
  const request = await requestService.getRequestById(requestId);

  if (!request || request.status !== "PENDING") {
    await ctx.reply("Р—Р°СЏРІРєР° РЅРµ РЅР°Р№РґРµРЅР° РёР»Рё СѓР¶Рµ РѕР±СЂР°Р±РѕС‚Р°РЅР°.");
    return;
  }

  const importedClients = await adminService.listImportedClients();

  if (importedClients.length === 0) {
    await ctx.reply("РЎРІРѕР±РѕРґРЅС‹С… imported-РєР»РёРµРЅС‚РѕРІ СЃРµР№С‡Р°СЃ РЅРµС‚.");
    return;
  }

  await ctx.reply(
    `Р’С‹Р±РµСЂРёС‚Рµ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёР№ РєР»РёРµРЅС‚ РґР»СЏ Р·Р°СЏРІРєРё #${requestId}:`,
    {
      reply_markup: createImportedClientsForRequestKeyboard(requestId, importedClients),
    },
  );
}

async function sendUserPicker(
  ctx: any,
  action: "userinfo" | "setexpiry" | "disable" | "enable",
  filter: Exclude<AdminUserFilter, "pending"> = "all",
) {
  const users = await adminService.listUsers(filter);

  if (users.length === 0) {
    await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РїРѕРєР° РЅРµС‚.");
    return;
  }

  const title =
    action === "userinfo"
      ? "Р’С‹Р±РµСЂРёС‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РґР»СЏ РєР°СЂС‚РѕС‡РєРё:"
      : action === "setexpiry"
        ? "Р’С‹Р±РµСЂРёС‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РґР»СЏ РёР·РјРµРЅРµРЅРёСЏ СЃСЂРѕРєР°:"
        : action === "disable"
          ? "Р’С‹Р±РµСЂРёС‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РґР»СЏ РѕС‚РєР»СЋС‡РµРЅРёСЏ:"
          : "Р’С‹Р±РµСЂРёС‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РґР»СЏ РІРєР»СЋС‡РµРЅРёСЏ:";

  await ctx.reply(title, {
    reply_markup: createUserPickerKeyboard(action, users),
  });
}

async function sendUserFilterPicker(ctx: any, action: "userinfo" | "listusers") {
  const title =
    action === "userinfo"
      ? "Р вЂ™РЎвЂ№Р В±Р ВµРЎР‚Р С‘РЎвЂљР Вµ РЎвЂћР С‘Р В»РЎРЉРЎвЂљРЎР‚ Р Т‘Р В»РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘ Р С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»РЎРЏ:"
      : "Р вЂ™РЎвЂ№Р В±Р ВµРЎР‚Р С‘РЎвЂљР Вµ РЎвЂћР С‘Р В»РЎРЉРЎвЂљРЎР‚ Р Т‘Р В»РЎРЏ РЎРѓР С—Р С‘РЎРѓР С”Р В° Р С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»Р ВµР в„–:";

  await ctx.reply(title, {
    reply_markup: createUserFilterKeyboard(action),
  });
}

async function sendFilteredUserList(ctx: any, filter: AdminUserFilter) {
  if (filter === "pending") {
    await sendPendingRequests(ctx);
    return;
  }

  const users = await adminService.listUsers(filter);

  if (users.length === 0) {
    await ctx.reply(`Р СџР С• РЎвЂћР С‘Р В»РЎРЉРЎвЂљРЎР‚РЎС“ ${formatFilterLabel(filter)} Р С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»Р ВµР в„– Р С—Р С•Р С”Р В° Р Р…Р ВµРЎвЂљ.`);
    return;
  }

  await ctx.reply(
    [
      `Р РЋР С—Р С‘РЎРѓР С•Р С” Р С—Р С• РЎвЂћР С‘Р В»РЎРЉРЎвЂљРЎР‚РЎС“: ${formatFilterLabel(filter)}`,
      "",
      users
        .map((user: { fullName: string; telegramId: string; vpnClient: { status: string } | null }) => {
          const status = user.vpnClient?.status.toLowerCase() ?? "no-client";
          return `${user.fullName} | tg=${user.telegramId} | ${status}`;
        })
        .join("\n"),
    ].join("\n"),
  );
}

function parseRequestId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const requestId = Number.parseInt(value, 10);
  return Number.isInteger(requestId) ? requestId : null;
}

function parseBindSelection(value: string | undefined): { requestId: number; importedUserId: number } | null {
  if (!value) {
    return null;
  }

  const [rawRequestId, rawImportedUserId] = value.split(":");
  const requestId = Number.parseInt(rawRequestId, 10);
  const importedUserId = Number.parseInt(rawImportedUserId, 10);

  if (!Number.isInteger(requestId) || !Number.isInteger(importedUserId)) {
    return null;
  }

  return { requestId, importedUserId };
}

async function sendRequestDetails(ctx: any, requestId: number) {
  const request = await requestService.getRequestById(requestId);

  if (!request) {
    await ctx.reply("Р—Р°СЏРІРєР° РЅРµ РЅР°Р№РґРµРЅР°.");
    return;
  }

  await ctx.reply(
    [
      `Р—Р°СЏРІРєР° #${request.id}`,
      `РЎС‚Р°С‚СѓСЃ: ${request.status.toLowerCase()}`,
      `РРјСЏ: ${request.user.fullName}`,
      `Telegram ID: ${request.user.telegramId}`,
      `Username: ${request.user.username ?? "-"}`,
      `РЎРѕР·РґР°РЅР°: ${formatDate(request.createdAt)}`,
      `РўРµРєСѓС‰РёР№ РєР»РёРµРЅС‚: ${request.user.vpnClient ? "РµСЃС‚СЊ" : "РЅРµС‚"}`,
    ].join("\n"),
    request.status === "PENDING"
      ? { reply_markup: createRequestDecisionKeyboard(request.id) }
      : undefined,
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
      "Р—Р°РїСѓСЃРєР°СЋ РїРѕС€Р°РіРѕРІРѕРµ СЂСѓС‡РЅРѕРµ РґРѕР±Р°РІР»РµРЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.",
      "РћС‚РїСЂР°РІСЊС‚Рµ `/cancel`, РµСЃР»Рё Р·Р°С…РѕС‚РёС‚Рµ РѕС‚РјРµРЅРёС‚СЊ СЃС†РµРЅР°СЂРёР№.",
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
      "Р—Р°РїСѓСЃРєР°СЋ РїРѕС€Р°РіРѕРІРѕРµ РёР·РјРµРЅРµРЅРёРµ СЃСЂРѕРєР° РґРµР№СЃС‚РІРёСЏ.",
      "РћС‚РїСЂР°РІСЊС‚Рµ `/cancel`, РµСЃР»Рё Р·Р°С…РѕС‚РёС‚Рµ РѕС‚РјРµРЅРёС‚СЊ СЃС†РµРЅР°СЂРёР№.",
      "",
      setExpiryPrompts.telegramId,
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}

async function startSetExpiryDateFlow(ctx: any, adminIdentity: { telegramId: string }, telegramId: string) {
  adminStates.set(adminIdentity.telegramId, {
    kind: "setexpiry",
    step: "expiresAt",
    draft: { telegramId },
  });

  await ctx.reply(
    [
      "Р’РІРµРґРёС‚Рµ РЅРѕРІСѓСЋ РґР°С‚Сѓ РѕРєРѕРЅС‡Р°РЅРёСЏ РІ С„РѕСЂРјР°С‚Рµ YYYY-MM-DD РёР»Рё `none`.",
      "РћС‚РїСЂР°РІСЊС‚Рµ `/cancel`, РµСЃР»Рё Р·Р°С…РѕС‚РёС‚Рµ РѕС‚РјРµРЅРёС‚СЊ СЃС†РµРЅР°СЂРёР№.",
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

async function sendSetExpiryOptions(ctx: any, telegramId: string) {
  const user = await adminService.getUserInfo(telegramId);

  if (!user) {
    await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ.");
    return false;
  }

  await ctx.reply(
    [
      `Р’С‹Р±РµСЂРёС‚Рµ РЅРѕРІС‹Р№ СЃСЂРѕРє РґР»СЏ ${user.fullName}.`,
      `РўРµРєСѓС‰РёР№ СЃСЂРѕРє: ${formatDate(user.vpnClient?.expiresAt ?? null)}`,
      "",
      "РњРѕР¶РЅРѕ РІС‹Р±СЂР°С‚СЊ Р±С‹СЃС‚СЂС‹Р№ РІР°СЂРёР°РЅС‚ РёР»Рё РїРµСЂРµР№С‚Рё Рє СЂСѓС‡РЅРѕРјСѓ РІРІРѕРґСѓ РґР°С‚С‹.",
    ].join("\n"),
    {
      reply_markup: createExpiryOptionsKeyboard(telegramId),
    },
  );

  return true;
}

function formatTrafficBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

async function formatAdminUserInfoMessage(user: any) {
  const trafficStats = user.vpnClient?.emailLabel
    ? await xrayStatsService.getUserTraffic(user.vpnClient.emailLabel)
    : null;
  const latestSnapshot = await trafficSnapshotService.getLatestSnapshot(user.id);
  const trafficDelta24h = await trafficSnapshotService.getDeltaForLastHours(user.id, 24);

  return [
    `Имя: ${user.fullName}`,
    `Telegram ID: ${user.telegramId}`,
    `Username: ${user.username ?? "-"}`,
    `VPN статус: ${user.vpnClient?.status.toLowerCase() ?? "нет клиента"}`,
    `Доступ до: ${formatDate(user.vpnClient?.expiresAt ?? null)}`,
    `Трафик входящий: ${trafficStats ? formatTrafficBytes(trafficStats.downlinkBytes) : "нет данных"}`,
    `Трафик исходящий: ${trafficStats ? formatTrafficBytes(trafficStats.uplinkBytes) : "нет данных"}`,
    `Трафик всего: ${trafficStats ? formatTrafficBytes(trafficStats.totalBytes) : "нет данных"}`,
    `Последний снимок: ${formatDate(latestSnapshot?.capturedAt ?? null)}`,
    `Прирост за 24 часа: ${trafficDelta24h ? formatTrafficBytes(trafficDelta24h.totalBytes) : "нет истории"}`,
  ].join("\n");
}

async function applyQuickExpiry(ctx: any, admin: NonNullable<Awaited<ReturnType<typeof getAdminIdentity>>>, telegramId: string, days: number) {
  const user = await adminService.getUserInfo(telegramId);

  if (!user?.vpnClient) {
    await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РёР»Рё VPN-РєР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ.");
    return;
  }

  const now = new Date();
  const currentExpiry = user.vpnClient.expiresAt;
  const baseDate = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  const expiresAt = addDays(baseDate, days);
  const client = await adminService.setExpiry(admin.adminUser.id, telegramId, expiresAt);

  if (!client) {
    await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РёР»Рё VPN-РєР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ.");
    return;
  }

  adminStates.delete(admin.identity.telegramId);
  await ctx.reply(`РЎСЂРѕРє РїСЂРѕРґР»С‘РЅ РЅР° ${days} РґРЅРµР№. РќРѕРІС‹Р№ СЃСЂРѕРє РґРµР№СЃС‚РІРёСЏ: ${formatDate(client.expiresAt)}.`);
}

async function startToggleFlow(ctx: any, adminIdentity: { telegramId: string }, kind: "disable" | "enable") {
  adminStates.set(adminIdentity.telegramId, { kind });

  await ctx.reply(
    [
      kind === "disable"
        ? "Р—Р°РїСѓСЃРєР°СЋ РїРѕС€Р°РіРѕРІРѕРµ РѕС‚РєР»СЋС‡РµРЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ."
        : "Р—Р°РїСѓСЃРєР°СЋ РїРѕС€Р°РіРѕРІРѕРµ РІРєР»СЋС‡РµРЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.",
      "РћС‚РїСЂР°РІСЊС‚Рµ `/cancel`, РµСЃР»Рё Р·Р°С…РѕС‚РёС‚Рµ РѕС‚РјРµРЅРёС‚СЊ СЃС†РµРЅР°СЂРёР№.",
      "",
      "Р’РІРµРґРёС‚Рµ Telegram ID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.",
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}

async function startUserInfoFlow(ctx: any, adminIdentity: { telegramId: string }) {
  adminStates.set(adminIdentity.telegramId, { kind: "userinfo" });

  await ctx.reply(
    [
      "Р—Р°РїСѓСЃРєР°СЋ РїСЂРѕСЃРјРѕС‚СЂ РєР°СЂС‚РѕС‡РєРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.",
      "РћС‚РїСЂР°РІСЊС‚Рµ `/cancel`, РµСЃР»Рё Р·Р°С…РѕС‚РёС‚Рµ РѕС‚РјРµРЅРёС‚СЊ СЃС†РµРЅР°СЂРёР№.",
      "",
      "Р’РІРµРґРёС‚Рµ Telegram ID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.",
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}

async function startBindClientFlow(ctx: any, adminIdentity: { telegramId: string }) {
  adminStates.set(adminIdentity.telegramId, {
    kind: "bindclient",
    step: "telegramId",
    draft: {},
  });

  await ctx.reply(
    [
      "Р—Р°РїСѓСЃРєР°СЋ РїСЂРёРІСЏР·РєСѓ imported-РєР»РёРµРЅС‚Р° Рє СЂРµР°Р»СЊРЅРѕРјСѓ Telegram ID.",
      "РћС‚РїСЂР°РІСЊС‚Рµ `/cancel`, РµСЃР»Рё Р·Р°С…РѕС‚РёС‚Рµ РѕС‚РјРµРЅРёС‚СЊ СЃС†РµРЅР°СЂРёР№.",
      "",
      bindClientPrompts.telegramId,
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}

async function handleAddUserState(ctx: any, admin: Awaited<ReturnType<typeof getAdminIdentity>>, state: AddUserState, text: string) {
  const parsed = parseAddUserValue(state.step, text);

  if (!parsed.ok) {
    await ctx.reply(parsed.error, { parse_mode: "Markdown" });
    return true;
  }

  state.draft[state.step] = parsed.value as never;

  const nextStep = getNextAddUserField(state.step);

  if (!nextStep) {
    const client = await adminService.addOrUpdateUser(admin!.adminUser.id, buildAddUserInput(state.draft));
    adminStates.delete(admin!.identity.telegramId);

    await ctx.reply(
      [
        `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃРѕС…СЂР°РЅС‘РЅ: ${client.user.fullName}`,
        `Telegram ID: ${client.user.telegramId}`,
        `РЎС‚Р°С‚СѓСЃ: ${client.status.toLowerCase()}`,
        `Р”РѕСЃС‚СѓРї РґРѕ: ${formatDate(client.expiresAt)}`,
      ].join("\n"),
    );
    return true;
  }

  state.step = nextStep;
  adminStates.set(admin!.identity.telegramId, state);
  await ctx.reply(addUserPrompts[nextStep], { parse_mode: "Markdown" });
  return true;
}

async function handleSetExpiryState(ctx: any, admin: Awaited<ReturnType<typeof getAdminIdentity>>, state: SetExpiryState, text: string) {
  if (state.step === "telegramId") {
    state.draft.telegramId = text.trim();
    state.step = "expiresAt";
    adminStates.set(admin!.identity.telegramId, state);
    await ctx.reply(setExpiryPrompts.expiresAt, { parse_mode: "Markdown" });
    return true;
  }

  const parsed = parseExpiryValue(text);

  if (!parsed.ok) {
    await ctx.reply(parsed.error, { parse_mode: "Markdown" });
    return true;
  }

  const client = await adminService.setExpiry(admin!.adminUser.id, state.draft.telegramId!, parsed.value);
  adminStates.delete(admin!.identity.telegramId);

  if (!client) {
    await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РёР»Рё VPN-РєР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ.");
    return true;
  }

  await ctx.reply(`РќРѕРІС‹Р№ СЃСЂРѕРє РґРµР№СЃС‚РІРёСЏ: ${formatDate(client.expiresAt)}.`);
  return true;
}

async function handleToggleState(ctx: any, admin: Awaited<ReturnType<typeof getAdminIdentity>>, state: ToggleState, text: string) {
  const telegramId = text.trim();

  if (!telegramId) {
    await ctx.reply("Р’РІРµРґРёС‚Рµ Telegram ID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.");
    return true;
  }

  const client = await adminService.setDisabled(
    admin!.adminUser.id,
    telegramId,
    state.kind === "disable",
  );
  adminStates.delete(admin!.identity.telegramId);

  if (!client) {
    await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РёР»Рё VPN-РєР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ.");
    return true;
  }

  await ctx.reply(`РЎС‚Р°С‚СѓСЃ РѕР±РЅРѕРІР»С‘РЅ: ${client.status.toLowerCase()}.`);
  return true;
}

async function handleUserInfoState(ctx: any, admin: Awaited<ReturnType<typeof getAdminIdentity>>, text: string) {
  const telegramId = text.trim();

  if (!telegramId) {
    await ctx.reply("Р’РІРµРґРёС‚Рµ Telegram ID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.");
    return true;
  }

  const user = await adminService.getUserInfo(telegramId);
  adminStates.delete(admin!.identity.telegramId);

  if (!user) {
    await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ.");
    return true;
  }

  await ctx.reply(await formatAdminUserInfoMessage(user));
  return true;

  /*
  await ctx.reply(
    [
      `РРјСЏ: ${user.fullName}`,
      `Telegram ID: ${user.telegramId}`,
      `Username: ${user.username ?? "-"}`,
      `VPN СЃС‚Р°С‚СѓСЃ: ${user.vpnClient?.status.toLowerCase() ?? "РЅРµС‚ РєР»РёРµРЅС‚Р°"}`,
      `Р”РѕСЃС‚СѓРї РґРѕ: ${formatDate(user.vpnClient?.expiresAt ?? null)}`,
    ].join("\n"),
  );
  */
  return true;
}

async function handleBindClientState(ctx: any, admin: Awaited<ReturnType<typeof getAdminIdentity>>, state: BindClientState, text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    await ctx.reply("РџСѓСЃС‚РѕРµ Р·РЅР°С‡РµРЅРёРµ РЅРµ РїРѕРґС…РѕРґРёС‚. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰С‘ СЂР°Р·.");
    return true;
  }

  if (state.step === "telegramId") {
    state.draft.telegramId = trimmed;
    state.step = "lookup";
    adminStates.set(admin!.identity.telegramId, state);
    await ctx.reply(bindClientPrompts.lookup, { parse_mode: "Markdown" });
    return true;
  }

  const result = await adminService.bindImportedClient(
    admin!.adminUser.id,
    state.draft.telegramId!,
    trimmed,
  );
  adminStates.delete(admin!.identity.telegramId);

  if (!result.ok) {
    const errorText =
      result.reason === "target_not_found"
        ? "Р¦РµР»РµРІРѕР№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ. РџСѓСЃС‚СЊ РѕРЅ СЃРЅР°С‡Р°Р»Р° РЅР°РїРёС€РµС‚ Р±РѕС‚Сѓ /start."
        : result.reason === "target_already_has_client"
          ? "РЈ СЌС‚РѕРіРѕ Telegram ID СѓР¶Рµ РµСЃС‚СЊ РїСЂРёРІСЏР·Р°РЅРЅС‹Р№ VPN-РєР»РёРµРЅС‚."
          : "Imported-РєР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ. РСЃРїРѕР»СЊР·СѓР№С‚Рµ email label, UUID РёР»Рё imported:... РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ.";

    await ctx.reply(errorText);
    return true;
  }

  await ctx.reply(
    [
      "РљР»РёРµРЅС‚ РїСЂРёРІСЏР·Р°РЅ.",
      `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ: ${result.client.user.fullName}`,
      `Telegram ID: ${result.client.user.telegramId}`,
      `Email label: ${result.client.emailLabel}`,
      `UUID: ${result.client.uuid}`,
    ].join("\n"),
  );

  await ctx.api.sendMessage(
    result.client.user.telegramId,
    "Р”РѕСЃС‚СѓРї РїСЂРёРІСЏР·Р°РЅ Рє РІР°С€РµРјСѓ Telegram-Р°РєРєР°СѓРЅС‚Сѓ. РћС‚РєСЂРѕР№С‚Рµ /start Рё РїРѕР»СѓС‡РёС‚Рµ СЃРІРѕР№ РєРѕРЅС„РёРі.",
    { reply_markup: createMainMenuKeyboard() },
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
      await ctx.reply("РЎС†РµРЅР°СЂРёР№ РѕС‚РјРµРЅС‘РЅ.");
      return true;
    }

    await ctx.reply(
      "РЎРµР№С‡Р°СЃ Р°РєС‚РёРІРµРЅ Р°РґРјРёРЅСЃРєРёР№ СЃС†РµРЅР°СЂРёР№. Р—Р°РІРµСЂС€РёС‚Рµ РµРіРѕ РёР»Рё РѕС‚РїСЂР°РІСЊС‚Рµ `/cancel`.",
      { parse_mode: "Markdown" },
    );
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

  if (state.kind === "bindclient") {
    return handleBindClientState(ctx, admin, state, text);
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
    if (admin) {
      await sendAdminMenu(ctx);
    }
  });

  bot.command("requests", async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (admin) {
      await sendPendingRequests(ctx);
    }
  });

  bot.command("imported", async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (admin) {
      await sendImportedClients(ctx);
    }
  });

  bot.command("bindclient", async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    const [telegramId, lookup] = parseCommandArgs(ctx.message?.text);

    if (telegramId && lookup) {
      const result = await adminService.bindImportedClient(admin.adminUser.id, telegramId, lookup);

      if (!result.ok) {
        const errorText =
          result.reason === "target_not_found"
            ? "Р¦РµР»РµРІРѕР№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ. РџСѓСЃС‚СЊ РѕРЅ СЃРЅР°С‡Р°Р»Р° РЅР°РїРёС€РµС‚ Р±РѕС‚Сѓ /start."
            : result.reason === "target_already_has_client"
              ? "РЈ СЌС‚РѕРіРѕ Telegram ID СѓР¶Рµ РµСЃС‚СЊ РїСЂРёРІСЏР·Р°РЅРЅС‹Р№ VPN-РєР»РёРµРЅС‚."
              : "Imported-РєР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ. РСЃРїРѕР»СЊР·СѓР№С‚Рµ email label, UUID РёР»Рё imported:... РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ.";

        await ctx.reply(errorText);
        return;
      }

      await ctx.reply(
        [
          "РљР»РёРµРЅС‚ РїСЂРёРІСЏР·Р°РЅ.",
          `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ: ${result.client.user.fullName}`,
          `Telegram ID: ${result.client.user.telegramId}`,
          `Email label: ${result.client.emailLabel}`,
          `UUID: ${result.client.uuid}`,
        ].join("\n"),
      );
      return;
    }

    await startBindClientFlow(ctx, admin.identity);
  });

  bot.command("adduser", async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (admin) {
      await startAddUserFlow(ctx, admin.identity);
    }
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
        await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РёР»Рё VPN-РєР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ.");
        return;
      }

      await ctx.reply(`РќРѕРІС‹Р№ СЃСЂРѕРє РґРµР№СЃС‚РІРёСЏ: ${formatDate(client.expiresAt)}.`);
      return;
    }

    await sendUserPicker(ctx, "setexpiry");
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
        await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РёР»Рё VPN-РєР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ.");
        return;
      }

      await ctx.reply(`РЎС‚Р°С‚СѓСЃ РѕР±РЅРѕРІР»С‘РЅ: ${client.status.toLowerCase()}.`);
      return;
    }

    await sendUserPicker(ctx, commandKind);
  });

  bot.command("cancel", async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    if (!adminStates.has(admin.identity.telegramId)) {
      await ctx.reply("РђРєС‚РёРІРЅРѕРіРѕ СЃС†РµРЅР°СЂРёСЏ СЃРµР№С‡Р°СЃ РЅРµС‚.");
      return;
    }

    adminStates.delete(admin.identity.telegramId);
    await ctx.reply("РЎС†РµРЅР°СЂРёР№ РѕС‚РјРµРЅС‘РЅ.");
  });

  bot.command("listusers", async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    const [rawFilter] = parseCommandArgs(ctx.message?.text);
    const filter = (rawFilter?.toLowerCase() as AdminUserFilter | undefined) ?? "all";

    if (["all", "active", "expired", "disabled", "pending"].includes(filter)) {
      await sendFilteredUserList(ctx, filter);
      return;
      await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РїРѕРєР° РЅРµС‚.");
      return;
    }

    const users: Array<{
      fullName: string;
      telegramId: string;
      vpnClient: { status: string } | null;
    }> = [];
    await sendUserFilterPicker(ctx, "listusers");
    return;
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
      await sendUserFilterPicker(ctx, "userinfo");
      return;
    }

    const user = await adminService.getUserInfo(telegramId);

    if (!user) {
      await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ.");
      return;
    }

    await ctx.reply(await formatAdminUserInfoMessage(user));
    return;

    /*
    await ctx.reply(
      [
        `РРјСЏ: ${user.fullName}`,
        `Telegram ID: ${user.telegramId}`,
        `Username: ${user.username ?? "-"}`,
        `VPN СЃС‚Р°С‚СѓСЃ: ${user.vpnClient?.status.toLowerCase() ?? "РЅРµС‚ РєР»РёРµРЅС‚Р°"}`,
        `Р”РѕСЃС‚СѓРї РґРѕ: ${formatDate(user.vpnClient?.expiresAt ?? null)}`,
      ].join("\n"),
    );
    */
  });

  bot.callbackQuery(callbacks.adminRequests, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();
    await sendPendingRequests(ctx);
  });

  bot.callbackQuery(callbacks.adminImported, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();
    await sendImportedClients(ctx);
  });

  bot.callbackQuery(callbacks.adminBindClient, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();
    await startBindClientFlow(ctx, admin.identity);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminRequestViewPrefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const requestId = parseRequestId(ctx.match?.[1]);
    if (!requestId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ Р·Р°СЏРІРєРё.");
      return;
    }

    await sendRequestDetails(ctx, requestId);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminRequestApprovePrefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const requestId = parseRequestId(ctx.match?.[1]);
    if (!requestId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ Р·Р°СЏРІРєРё.");
      return;
    }

    const client = await adminService.approveRequest(admin.adminUser.id, requestId);

    if (!client) {
      await ctx.reply("Р—Р°СЏРІРєР° РЅРµ РЅР°Р№РґРµРЅР° РёР»Рё СѓР¶Рµ РѕР±СЂР°Р±РѕС‚Р°РЅР°.");
      return;
    }

    await ctx.reply(
      [
        "Р—Р°СЏРІРєР° РѕРґРѕР±СЂРµРЅР°.",
        `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ: ${client.user.fullName}`,
        `Telegram ID: ${client.user.telegramId}`,
        `Р”РѕСЃС‚СѓРї РґРѕ: ${formatDate(client.expiresAt)}`,
      ].join("\n"),
    );

    await ctx.api.sendMessage(client.user.telegramId, messages.requestApproved, {
      reply_markup: createMainMenuKeyboard(),
    });
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminRequestBindPrefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const requestId = parseRequestId(ctx.match?.[1]);
    if (!requestId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ Р·Р°СЏРІРєРё.");
      return;
    }

    await sendImportedClientsForRequest(ctx, requestId);
  });

  bot.callbackQuery(
    new RegExp(`^${callbacks.adminRequestBindSelectPrefix}(\\d+:\\d+)$`),
    async (ctx) => {
      const admin = await getAdminIdentity(ctx);
      if (!admin) return;
      await ctx.answerCallbackQuery();

      const selection = parseBindSelection(ctx.match?.[1]);

      if (!selection) {
        await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РІС‹Р±РѕСЂ imported-РєР»РёРµРЅС‚Р°.");
        return;
      }

      const result = await adminService.bindImportedClientToRequest(
        admin.adminUser.id,
        selection.requestId,
        selection.importedUserId,
      );

      if (!result.ok) {
        const errorText =
          result.reason === "request_not_found"
            ? "Р—Р°СЏРІРєР° РЅРµ РЅР°Р№РґРµРЅР° РёР»Рё СѓР¶Рµ РѕР±СЂР°Р±РѕС‚Р°РЅР°."
            : result.reason === "target_already_has_client"
              ? "РЈ Р°РІС‚РѕСЂР° Р·Р°СЏРІРєРё СѓР¶Рµ РµСЃС‚СЊ РїСЂРёРІСЏР·Р°РЅРЅС‹Р№ VPN-РєР»РёРµРЅС‚."
              : "Imported-РєР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ.";

        await ctx.reply(errorText);
        return;
      }

      await ctx.reply(
        [
          "РЎСѓС‰РµСЃС‚РІСѓСЋС‰РёР№ РєР»РёРµРЅС‚ РїСЂРёРІСЏР·Р°РЅ Рє Р·Р°СЏРІРєРµ.",
          `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ: ${result.client.user.fullName}`,
          `Telegram ID: ${result.client.user.telegramId}`,
          `Email label: ${result.client.emailLabel}`,
          `UUID: ${result.client.uuid}`,
        ].join("\n"),
      );

      await ctx.api.sendMessage(
        result.client.user.telegramId,
        "Р”РѕСЃС‚СѓРї РїСЂРёРІСЏР·Р°РЅ Рє РІР°С€РµРјСѓ Telegram-Р°РєРєР°СѓРЅС‚Сѓ. РћС‚РєСЂРѕР№С‚Рµ /start Рё РїРѕР»СѓС‡РёС‚Рµ СЃРІРѕР№ РєРѕРЅС„РёРі.",
        { reply_markup: createMainMenuKeyboard() },
      );
    },
  );

  bot.callbackQuery(new RegExp(`^${callbacks.adminRequestRejectPrefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const requestId = parseRequestId(ctx.match?.[1]);
    if (!requestId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ Р·Р°СЏРІРєРё.");
      return;
    }

    const request = await adminService.rejectRequest(admin.adminUser.id, requestId);

    if (!request) {
      await ctx.reply("Р—Р°СЏРІРєР° РЅРµ РЅР°Р№РґРµРЅР° РёР»Рё СѓР¶Рµ РѕР±СЂР°Р±РѕС‚Р°РЅР°.");
      return;
    }

    await ctx.reply(`Р—Р°СЏРІРєР° #${request.id} РѕС‚РєР»РѕРЅРµРЅР°.`);

    await ctx.api.sendMessage(request.user.telegramId, messages.requestRejected, {
      reply_markup: createContactKeyboard(),
    });
  });

  bot.callbackQuery(callbacks.adminAddUser, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();
    await startAddUserFlow(ctx, admin.identity);
  });

  bot.callbackQuery(callbacks.adminSetExpiry, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();
    await sendUserPicker(ctx, "setexpiry");
  });

  bot.callbackQuery(callbacks.adminDisable, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();
    await sendUserPicker(ctx, "disable");
  });

  bot.callbackQuery(callbacks.adminEnable, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();
    await sendUserPicker(ctx, "enable");
  });

  bot.callbackQuery(callbacks.adminListUsers, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const users: Array<{
      fullName: string;
      telegramId: string;
      vpnClient: { status: string } | null;
    }> = [];
    await sendUserFilterPicker(ctx, "listusers");
    return;

    if (users.length === 0) {
      await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РїРѕРєР° РЅРµС‚.");
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
    if (!admin) return;
    await ctx.answerCallbackQuery();
    await sendUserFilterPicker(ctx, "userinfo");
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminListUsersFilterPrefix}(all|active|expired|disabled|pending)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const filter = ctx.match?.[1] as AdminUserFilter | undefined;
    if (!filter) {
      await ctx.reply("Р СњР ВµР С”Р С•РЎР‚РЎР‚Р ВµР С”РЎвЂљР Р…РЎвЂ№Р в„– РЎвЂћР С‘Р В»РЎРЉРЎвЂљРЎР‚.");
      return;
    }

    await sendFilteredUserList(ctx, filter);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminUserFilterPrefix}(all|active|expired|disabled)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const filter = ctx.match?.[1] as Exclude<AdminUserFilter, "pending"> | undefined;
    if (!filter) {
      await ctx.reply("Р СњР ВµР С”Р С•РЎР‚РЎР‚Р ВµР С”РЎвЂљР Р…РЎвЂ№Р в„– РЎвЂћР С‘Р В»РЎРЉРЎвЂљРЎР‚.");
      return;
    }

    await sendUserPicker(ctx, "userinfo", filter);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminPickUserInfoPrefix}(.+)$`), async (ctx, next) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = ctx.match?.[1]?.trim();
    if (!telegramId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РІС‹Р±РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.");
      return;
    }

    const user = await adminService.getUserInfo(telegramId);
    if (!user) {
      await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ.");
      return;
    }

    await ctx.reply(await formatAdminUserInfoMessage(user));
  });

  bot.callbackQuery(new RegExp(`^admin:unused:userinfo:(.+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = ctx.match?.[1]?.trim();
    if (!telegramId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РІС‹Р±РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.");
      return;
    }

    const user = await adminService.getUserInfo(telegramId);
    if (!user) {
      await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ.");
      return;
    }

    await ctx.reply(
      [
        `РРјСЏ: ${user.fullName}`,
        `Telegram ID: ${user.telegramId}`,
        `Username: ${user.username ?? "-"}`,
        `VPN СЃС‚Р°С‚СѓСЃ: ${user.vpnClient?.status.toLowerCase() ?? "РЅРµС‚ РєР»РёРµРЅС‚Р°"}`,
        `Р”РѕСЃС‚СѓРї РґРѕ: ${formatDate(user.vpnClient?.expiresAt ?? null)}`,
      ].join("\n"),
    );
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminPickSetExpiryPrefix}(.+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = ctx.match?.[1]?.trim();
    if (!telegramId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РІС‹Р±РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.");
      return;
    }

    await sendSetExpiryOptions(ctx, telegramId);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminSetExpiryPlus30Prefix}(.+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = ctx.match?.[1]?.trim();
    if (!telegramId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РІС‹Р±РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.");
      return;
    }

    await applyQuickExpiry(ctx, admin, telegramId, 30);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminSetExpiryPlus60Prefix}(.+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = ctx.match?.[1]?.trim();
    if (!telegramId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РІС‹Р±РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.");
      return;
    }

    await applyQuickExpiry(ctx, admin, telegramId, 60);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminSetExpiryPlus90Prefix}(.+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = ctx.match?.[1]?.trim();
    if (!telegramId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РІС‹Р±РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.");
      return;
    }

    await applyQuickExpiry(ctx, admin, telegramId, 90);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminSetExpiryManualPrefix}(.+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = ctx.match?.[1]?.trim();
    if (!telegramId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РІС‹Р±РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.");
      return;
    }

    await startSetExpiryDateFlow(ctx, admin.identity, telegramId);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminPickDisablePrefix}(.+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = ctx.match?.[1]?.trim();
    if (!telegramId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РІС‹Р±РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.");
      return;
    }

    const client = await adminService.setDisabled(admin.adminUser.id, telegramId, true);
    if (!client) {
      await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РёР»Рё VPN-РєР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ.");
      return;
    }

    await ctx.reply(`РЎС‚Р°С‚СѓСЃ РѕР±РЅРѕРІР»С‘РЅ: ${client.status.toLowerCase()}.`);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminPickEnablePrefix}(.+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = ctx.match?.[1]?.trim();
    if (!telegramId) {
      await ctx.reply("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РІС‹Р±РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.");
      return;
    }

    const client = await adminService.setDisabled(admin.adminUser.id, telegramId, false);
    if (!client) {
      await ctx.reply("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РёР»Рё VPN-РєР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ.");
      return;
    }

    await ctx.reply(`РЎС‚Р°С‚СѓСЃ РѕР±РЅРѕРІР»С‘РЅ: ${client.status.toLowerCase()}.`);
  });
}
