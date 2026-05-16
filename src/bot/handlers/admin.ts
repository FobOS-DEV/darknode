import { InputFile } from "grammy";

import { adminMessages } from "../../constants/adminMessages";
import { callbacks } from "../../constants/callbacks";
import { messages } from "../../constants/messages";
import { adminService, type AdminUserFilter } from "../../services/adminService";
import { adminStateService } from "../../services/adminStateService";
import { requestService } from "../../services/requestService";
import { logger } from "../../config/logger";
import { qrCodeService } from "../../services/qrCodeService";
import { trafficSnapshotService } from "../../services/trafficSnapshotService";
import { userService } from "../../services/userService";
import {
  generateManualPlaceholderTelegramId,
  vpnGeneratorService,
} from "../../services/vpnGeneratorService";
import { xrayAccessLogService } from "../../services/xrayAccessLogService";
import { xrayStatsService } from "../../services/xrayStatsService";
import { env } from "../../config/env";
import type { VpnClientInput } from "../../services/vpnService";
import { BotContext, TelegramBot } from "../../types/bot";
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
} from "../keyboards/adminMenu";
import { createMainMenuKeyboard } from "../keyboards/mainMenu";
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

type BindClientField = "telegramId" | "lookup";
type BindClientState = {
  kind: "bindclient";
  step: BindClientField;
  draft: { telegramId?: string };
};

type GenerateUserField = "fullName" | "telegramId" | "expiresAt";
type GenerateUserDraft = {
  fullName?: string;
  telegramId?: string;
  expiresAt?: Date | null;
};
type GenerateUserState = {
  kind: "generateuser";
  step: GenerateUserField;
  draft: GenerateUserDraft;
};

const generateUserFieldOrder: GenerateUserField[] = ["fullName", "telegramId", "expiresAt"];

const generateUserPrompts: Record<GenerateUserField, string> = {
  fullName: adminMessages.enterFullName,
  telegramId: adminMessages.enterTelegramIdOptional,
  expiresAt: adminMessages.enterExpiryShort,
};

type AdminIdentity = {
  identity: NonNullable<ReturnType<typeof getTelegramIdentity>>;
  adminUser: { id: number };
};

type ImportedListUser = {
  fullName: string;
  telegramId: string;
  vpnClient: { status: string } | null;
};

const addUserFieldOrder: AddUserField[] = [
  "fullName",
  "telegramId",
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

const AUTO_TELEGRAM_ID_MARKER = "__autogen__";

const addUserPrompts: Record<AddUserField, string> = {
  telegramId: adminMessages.enterTelegramIdOptional,
  fullName: adminMessages.enterFullName,
  displayName: adminMessages.enterDisplayName,
  emailLabel: adminMessages.enterEmailLabel,
  uuid: adminMessages.enterUuid,
  vlessUrl: adminMessages.enterVlessUrl,
  server: adminMessages.enterServer,
  port: adminMessages.enterPort,
  publicKey: adminMessages.enterPublicKey,
  shortId: adminMessages.enterShortId,
  sni: adminMessages.enterSni,
  flow: adminMessages.enterFlow,
  expiresAt: adminMessages.enterExpiry,
};

const setExpiryPrompts: Record<SetExpiryField, string> = {
  telegramId: adminMessages.enterTelegramId,
  expiresAt: adminMessages.enterExpiry,
};

const bindClientPrompts: Record<BindClientField, string> = {
  telegramId: adminMessages.enterBindTarget,
  lookup: adminMessages.enterBindLookup,
};


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
    return { ok: false, error: adminMessages.emptyValue };
  }

  if (trimmed.toLowerCase() === "none") {
    return { ok: true, value: null };
  }

  const expiresAt = new Date(trimmed);

  if (Number.isNaN(expiresAt.getTime())) {
    return { ok: false, error: adminMessages.invalidDate };
  }

  return { ok: true, value: expiresAt };
}

function parseAddUserValue(
  step: AddUserField,
  value: string,
): { ok: true; value: AddUserDraft[keyof AddUserDraft] } | { ok: false; error: string } {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, error: adminMessages.emptyValue };
  }

  if (step === "port") {
    const port = Number(trimmed);

    if (!Number.isInteger(port)) {
      return { ok: false, error: adminMessages.invalidPort };
    }

    return { ok: true, value: port };
  }

  if (step === "expiresAt") {
    return parseExpiryValue(trimmed);
  }

  if (step === "telegramId") {
    const lower = trimmed.toLowerCase();
    if (lower === "none" || lower === "-") {
      return { ok: true, value: AUTO_TELEGRAM_ID_MARKER };
    }
    return { ok: true, value: trimmed };
  }

  return { ok: true, value: trimmed };
}

function buildAddUserInput(draft: AddUserDraft): VpnClientInput {
  const telegramId =
    draft.telegramId === AUTO_TELEGRAM_ID_MARKER
      ? generateManualPlaceholderTelegramId(draft.fullName)
      : draft.telegramId!;

  return {
    telegramId,
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

async function getAdminIdentity(ctx: BotContext): Promise<AdminIdentity | null> {
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

async function sendAdminMenu(ctx: BotContext) {
  await ctx.reply([adminMessages.menuHeader, ...adminMessages.menuLines].join("\n"), {
    reply_markup: createAdminMenuKeyboard(),
  });
}

async function sendPendingRequests(ctx: BotContext) {
  const requests = await adminService.listPendingRequests();

  if (requests.length === 0) {
    await ctx.reply(adminMessages.noPendingRequests);
    return;
  }

  await ctx.reply(adminMessages.pendingRequestsHeader, {
    reply_markup: createPendingRequestsKeyboard(requests),
  });
}

async function sendImportedClients(ctx: BotContext) {
  const importedClients = await adminService.listImportedClients();

  if (importedClients.length === 0) {
    await ctx.reply(adminMessages.noImportedClients);
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

async function sendImportedClientsForRequest(ctx: BotContext, requestId: number) {
  const request = await requestService.getRequestById(requestId);

  if (!request || request.status !== "PENDING") {
    await ctx.reply(adminMessages.requestAlreadyHandled);
    return;
  }

  const importedClients = await adminService.listImportedClients();

  if (importedClients.length === 0) {
    await ctx.reply(adminMessages.noImportedClients);
    return;
  }

  await ctx.reply(adminMessages.pickImportedForRequest(requestId), {
    reply_markup: createImportedClientsForRequestKeyboard(requestId, importedClients),
  });
}

type UserPickerAction = "userinfo" | "setexpiry" | "disable" | "enable";

async function sendUserPicker(
  ctx: BotContext,
  action: UserPickerAction,
  filter: Exclude<AdminUserFilter, "pending"> = "all",
  page = 0,
) {
  const users = await adminService.listUsers(filter);

  if (users.length === 0) {
    await ctx.reply(adminMessages.noUsers);
    return;
  }

  const title =
    action === "userinfo"
      ? adminMessages.pickUserForCard
      : action === "setexpiry"
        ? adminMessages.pickUserForExpiry
        : action === "disable"
          ? adminMessages.pickUserForDisable
          : adminMessages.pickUserForEnable;

  await ctx.reply(title, {
    reply_markup: createUserPickerKeyboard(action, users, filter, page),
  });
}

async function sendUserFilterPicker(ctx: BotContext, action: "userinfo" | "listusers") {
  const title =
    action === "userinfo"
      ? adminMessages.pickFilterForCard
      : adminMessages.pickFilterForList;

  await ctx.reply(title, {
    reply_markup: createUserFilterKeyboard(action),
  });
}

async function sendFilteredUserList(ctx: BotContext, filter: AdminUserFilter) {
  if (filter === "pending") {
    await sendPendingRequests(ctx);
    return;
  }

  const users = await adminService.listUsers(filter);

  if (users.length === 0) {
    await ctx.reply(adminMessages.filterEmpty(filter));
    return;
  }

  await ctx.reply(
    [
      adminMessages.filterListHeader(filter),
      "",
      users
        .map((user: ImportedListUser) => {
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

function parseUserId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const userId = Number.parseInt(value.trim(), 10);
  return Number.isInteger(userId) ? userId : null;
}

async function resolveTelegramIdFromUserId(value: string | undefined): Promise<string | null> {
  const userId = parseUserId(value);

  if (userId === null) {
    return null;
  }

  const user = await userService.findById(userId);
  return user?.telegramId ?? null;
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

async function sendRequestDetails(ctx: BotContext, requestId: number) {
  const request = await requestService.getRequestById(requestId);
  const labels = adminMessages.cardLabels;

  if (!request) {
    await ctx.reply(adminMessages.requestNotFound);
    return;
  }

  await ctx.reply(
    [
      `${labels.requestNumber} #${request.id}`,
      `${labels.status}: ${request.status.toLowerCase()}`,
      `${labels.name}: ${request.user.fullName}`,
      `${labels.telegramId}: ${request.user.telegramId}`,
      `${labels.username}: ${request.user.username ?? "-"}`,
      `${labels.created}: ${formatDate(request.createdAt)}`,
      `${labels.currentClient}: ${request.user.vpnClient ? adminMessages.yes : adminMessages.no}`,
    ].join("\n"),
    request.status === "PENDING"
      ? { reply_markup: createRequestDecisionKeyboard(request.id) }
      : undefined,
  );
}

async function startAddUserFlow(ctx: BotContext, adminIdentity: { telegramId: string }) {
  const firstStep = addUserFieldOrder[0];

  await adminStateService.set(adminIdentity.telegramId, {
    kind: "adduser",
    step: firstStep,
    draft: {},
  });

  await ctx.reply(
    [
      adminMessages.startAddUser,
      adminMessages.cancelHint,
      "",
      addUserPrompts[firstStep],
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}

async function startSetExpiryDateFlow(
  ctx: BotContext,
  adminIdentity: { telegramId: string },
  telegramId: string,
) {
  await adminStateService.set(adminIdentity.telegramId, {
    kind: "setexpiry",
    step: "expiresAt",
    draft: { telegramId },
  });

  await ctx.reply(
    [adminMessages.startSetExpiryDate, adminMessages.cancelHint].join("\n"),
    { parse_mode: "Markdown" },
  );
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

async function sendSetExpiryOptions(ctx: BotContext, userId: number) {
  const user = await userService.findById(userId);

  if (!user) {
    await ctx.reply(adminMessages.userNotFound);
    return false;
  }

  await ctx.reply(
    adminMessages.expiryOptionsTitle({
      fullName: user.fullName,
      current: formatDate(user.vpnClient?.expiresAt ?? null),
    }),
    {
      reply_markup: createExpiryOptionsKeyboard(user.id),
    },
  );

  return true;
}

function formatTrafficBytes(value: number | bigint): string {
  const numericValue = typeof value === "bigint" ? Number(value) : value;

  if (numericValue < 1024) {
    return `${numericValue} B`;
  }

  const units = ["KB", "MB", "GB", "TB", "PB"];
  let size = numericValue / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

async function formatAdminUserInfoMessage(user: {
  id: number;
  fullName: string;
  telegramId: string;
  username: string | null;
  vpnClient:
    | {
        status: string;
        expiresAt: Date | null;
        emailLabel: string;
      }
    | null;
}): Promise<string> {
  const labels = adminMessages.cardLabels;
  const emailLabel = user.vpnClient?.emailLabel;
  const trafficStats = emailLabel
    ? await xrayStatsService.getUserTraffic(emailLabel)
    : null;
  const latestSnapshot = await trafficSnapshotService.getLatestSnapshot(user.id);
  const trafficDelta24h = await trafficSnapshotService.getDeltaForLastHours(user.id, 24);
  const sharing = emailLabel
    ? await xrayAccessLogService.getStatsForEmail(emailLabel)
    : null;

  const lines = [
    `${labels.name}: ${user.fullName}`,
    `${labels.telegramId}: ${user.telegramId}`,
    `${labels.username}: ${user.username ?? "-"}`,
    `${labels.vpnStatus}: ${user.vpnClient?.status.toLowerCase() ?? adminMessages.noClient}`,
    `${labels.accessUntil}: ${formatDate(user.vpnClient?.expiresAt ?? null)}`,
    `${labels.trafficIn}: ${trafficStats ? formatTrafficBytes(trafficStats.downlinkBytes) : adminMessages.noTrafficData}`,
    `${labels.trafficOut}: ${trafficStats ? formatTrafficBytes(trafficStats.uplinkBytes) : adminMessages.noTrafficData}`,
    `${labels.trafficTotal}: ${trafficStats ? formatTrafficBytes(trafficStats.totalBytes) : adminMessages.noTrafficData}`,
    `${labels.lastSnapshot}: ${formatDate(latestSnapshot?.capturedAt ?? null)}`,
    `${labels.delta24h}: ${trafficDelta24h ? formatTrafficBytes(trafficDelta24h.totalBytes) : adminMessages.noTrafficHistory}`,
  ];

  if (emailLabel) {
    if (sharing) {
      lines.push(
        `${labels.sharingIps} (${env.sharingDetectorWindowHours}ч): ${sharing.uniqueIps}`,
        `${labels.sharingSubnets} (${env.sharingDetectorWindowHours}ч): ${sharing.uniqueSubnets}`,
        `${labels.sharingLastSeen}: ${formatTimestamp(sharing.lastSeen)}`,
      );

      if (sharing.uniqueSubnets >= env.sharingIpThreshold) {
        lines.push(labels.sharingFlag);
      }
    } else {
      lines.push(`${labels.sharingIps} (${env.sharingDetectorWindowHours}ч): ${labels.sharingNoData}`);
    }
  }

  return lines.join("\n");
}

async function applyQuickExpiry(
  ctx: BotContext,
  admin: AdminIdentity,
  telegramId: string,
  days: number,
) {
  const user = await adminService.getUserInfo(telegramId);

  if (!user?.vpnClient) {
    await ctx.reply(adminMessages.clientOrUserNotFound);
    return;
  }

  const now = new Date();
  const currentExpiry = user.vpnClient.expiresAt;
  const baseDate = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  const expiresAt = addDays(baseDate, days);
  const client = await adminService.setExpiry(admin.adminUser.id, telegramId, expiresAt);

  if (!client) {
    await ctx.reply(adminMessages.clientOrUserNotFound);
    return;
  }

  await adminStateService.delete(admin.identity.telegramId);
  await ctx.reply(
    adminMessages.expiryQuickApplied({
      days,
      newExpiry: formatDate(client.expiresAt),
    }),
  );
}

async function startBindClientFlow(ctx: BotContext, adminIdentity: { telegramId: string }) {
  await adminStateService.set(adminIdentity.telegramId, {
    kind: "bindclient",
    step: "telegramId",
    draft: {},
  });

  await ctx.reply(
    [
      adminMessages.startBindClient,
      adminMessages.cancelHint,
      "",
      bindClientPrompts.telegramId,
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}

function describeBindError(reason: "target_not_found" | "target_already_has_client" | "imported_not_found"): string {
  if (reason === "target_not_found") {
    return adminMessages.bindTargetNotFound;
  }

  if (reason === "target_already_has_client") {
    return adminMessages.bindTargetAlreadyHasClient;
  }

  return adminMessages.importedNotFound;
}

async function handleAddUserState(
  ctx: BotContext,
  admin: AdminIdentity,
  state: AddUserState,
  text: string,
): Promise<boolean> {
  const labels = adminMessages.cardLabels;
  const parsed = parseAddUserValue(state.step, text);

  if (!parsed.ok) {
    await ctx.reply(parsed.error, { parse_mode: "Markdown" });
    return true;
  }

  state.draft[state.step] = parsed.value as never;

  const nextStep = getNextAddUserField(state.step);

  if (!nextStep) {
    const client = await adminService.addOrUpdateUser(admin.adminUser.id, buildAddUserInput(state.draft));
    await adminStateService.delete(admin.identity.telegramId);

    await ctx.reply(
      [
        adminMessages.userSaved(client.user.fullName),
        `${labels.telegramId}: ${client.user.telegramId}`,
        `${labels.status}: ${client.status.toLowerCase()}`,
        `${labels.accessUntil}: ${formatDate(client.expiresAt)}`,
      ].join("\n"),
    );
    return true;
  }

  state.step = nextStep;
  await adminStateService.set(admin.identity.telegramId, state);
  await ctx.reply(addUserPrompts[nextStep], { parse_mode: "Markdown" });
  return true;
}

async function handleSetExpiryState(
  ctx: BotContext,
  admin: AdminIdentity,
  state: SetExpiryState,
  text: string,
): Promise<boolean> {
  if (state.step === "telegramId") {
    state.draft.telegramId = text.trim();
    state.step = "expiresAt";
    await adminStateService.set(admin.identity.telegramId, state);
    await ctx.reply(setExpiryPrompts.expiresAt, { parse_mode: "Markdown" });
    return true;
  }

  const parsed = parseExpiryValue(text);

  if (!parsed.ok) {
    await ctx.reply(parsed.error, { parse_mode: "Markdown" });
    return true;
  }

  const client = await adminService.setExpiry(admin.adminUser.id, state.draft.telegramId!, parsed.value);
  await adminStateService.delete(admin.identity.telegramId);

  if (!client) {
    await ctx.reply(adminMessages.clientOrUserNotFound);
    return true;
  }

  await ctx.reply(adminMessages.expiryUpdated(formatDate(client.expiresAt)));
  return true;
}

async function handleToggleState(
  ctx: BotContext,
  admin: AdminIdentity,
  state: ToggleState,
  text: string,
): Promise<boolean> {
  const telegramId = text.trim();

  if (!telegramId) {
    await ctx.reply(adminMessages.enterTelegramId);
    return true;
  }

  const client = await adminService.setDisabled(
    admin.adminUser.id,
    telegramId,
    state.kind === "disable",
  );
  await adminStateService.delete(admin.identity.telegramId);

  if (!client) {
    await ctx.reply(adminMessages.clientOrUserNotFound);
    return true;
  }

  await ctx.reply(adminMessages.statusUpdated(client.status.toLowerCase()));
  return true;
}

async function handleUserInfoState(
  ctx: BotContext,
  admin: AdminIdentity,
  text: string,
): Promise<boolean> {
  const telegramId = text.trim();

  if (!telegramId) {
    await ctx.reply(adminMessages.enterTelegramId);
    return true;
  }

  const user = await adminService.getUserInfo(telegramId);
  await adminStateService.delete(admin.identity.telegramId);

  if (!user) {
    await ctx.reply(adminMessages.userNotFound);
    return true;
  }

  await ctx.reply(await formatAdminUserInfoMessage(user));
  return true;
}

async function handleBindClientState(
  ctx: BotContext,
  admin: AdminIdentity,
  state: BindClientState,
  text: string,
): Promise<boolean> {
  const labels = adminMessages.cardLabels;
  const trimmed = text.trim();

  if (!trimmed) {
    await ctx.reply(adminMessages.emptyValue);
    return true;
  }

  if (state.step === "telegramId") {
    state.draft.telegramId = trimmed;
    state.step = "lookup";
    await adminStateService.set(admin.identity.telegramId, state);
    await ctx.reply(bindClientPrompts.lookup, { parse_mode: "Markdown" });
    return true;
  }

  const result = await adminService.bindImportedClient(
    admin.adminUser.id,
    state.draft.telegramId!,
    trimmed,
  );
  await adminStateService.delete(admin.identity.telegramId);

  if (!result.ok) {
    await ctx.reply(describeBindError(result.reason));
    return true;
  }

  await ctx.reply(
    [
      adminMessages.bindClientDone,
      `${labels.name}: ${result.client.user.fullName}`,
      `${labels.telegramId}: ${result.client.user.telegramId}`,
      `${labels.emailLabel}: ${result.client.emailLabel}`,
      `${labels.uuid}: ${result.client.uuid}`,
    ].join("\n"),
  );

  await ctx.api.sendMessage(result.client.user.telegramId, adminMessages.bindUserNotice, {
    reply_markup: createMainMenuKeyboard(),
  });

  return true;
}

function parseGenerateExpiry(
  value: string,
): { ok: true; value: Date | null } | { ok: false; error: string } {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, error: adminMessages.emptyValue };
  }

  const lower = trimmed.toLowerCase();

  if (lower === "none" || lower === "-") {
    return { ok: true, value: null };
  }

  if (lower === "default" || lower === "d") {
    const days = env.vpnDefaultExpiryDays;
    return { ok: true, value: new Date(Date.now() + days * 24 * 60 * 60 * 1000) };
  }

  if (/^\d+$/.test(trimmed)) {
    const days = Number.parseInt(trimmed, 10);
    if (days <= 0 || days > 36500) {
      return { ok: false, error: adminMessages.invalidDate };
    }
    return { ok: true, value: new Date(Date.now() + days * 24 * 60 * 60 * 1000) };
  }

  return parseExpiryValue(trimmed);
}

async function startGenerateUserFlow(ctx: BotContext, adminIdentity: { telegramId: string }) {
  const firstStep = generateUserFieldOrder[0];

  await adminStateService.set(adminIdentity.telegramId, {
    kind: "generateuser",
    step: firstStep,
    draft: {},
  });

  await ctx.reply(
    [
      adminMessages.startGenerateUser,
      adminMessages.cancelHint,
      "",
      generateUserPrompts[firstStep],
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function finishGenerateUserFlow(
  ctx: BotContext,
  admin: AdminIdentity,
  draft: GenerateUserDraft,
) {
  const labels = adminMessages.cardLabels;
  const fullName = draft.fullName!;
  const telegramId =
    draft.telegramId === AUTO_TELEGRAM_ID_MARKER || !draft.telegramId
      ? generateManualPlaceholderTelegramId(fullName)
      : draft.telegramId;
  const isManual = telegramId.startsWith("manual:");

  const generatedInput = vpnGeneratorService.generateForUser({
    telegramId,
    fullName,
    expiresAt: draft.expiresAt ?? null,
  });

  const client = await adminService.addOrUpdateUser(admin.adminUser.id, generatedInput);

  await ctx.reply(
    [
      adminMessages.generatedHeader,
      `${labels.name}: ${client.user.fullName}`,
      `${labels.telegramId}: ${client.user.telegramId}`,
      `${labels.emailLabel}: ${client.emailLabel}`,
      `${labels.uuid}: ${client.uuid}`,
      `${labels.accessUntil}: ${formatDate(client.expiresAt)}`,
    ].join("\n"),
  );

  await ctx.reply(`<code>${escapeHtml(client.vlessUrl)}</code>`, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });

  try {
    const qrPng = await qrCodeService.generateConfigPng(client.vlessUrl);
    await ctx.replyWithPhoto(new InputFile(qrPng, "vpn-config-qr.png"), {
      caption: messages.configQrCaption,
    });
  } catch (error) {
    logger.warn({ error, telegramId }, "Failed to generate config QR for admin");
  }

  if (!isManual) {
    try {
      await ctx.api.sendMessage(client.user.telegramId, adminMessages.generatedNotifyUser, {
        reply_markup: createMainMenuKeyboard(),
      });
    } catch (error) {
      logger.warn(
        { error, telegramId: client.user.telegramId },
        "Failed to notify user about generated config",
      );
    }
  }
}

async function handleGenerateUserState(
  ctx: BotContext,
  admin: AdminIdentity,
  state: GenerateUserState,
  text: string,
): Promise<boolean> {
  if (state.step === "fullName") {
    const trimmed = text.trim();
    if (!trimmed) {
      await ctx.reply(adminMessages.emptyValue);
      return true;
    }
    state.draft.fullName = trimmed;
    state.step = "telegramId";
    await adminStateService.set(admin.identity.telegramId, state);
    await ctx.reply(generateUserPrompts.telegramId, { parse_mode: "Markdown" });
    return true;
  }

  if (state.step === "telegramId") {
    const trimmed = text.trim();
    if (!trimmed) {
      await ctx.reply(adminMessages.emptyValue);
      return true;
    }
    const lower = trimmed.toLowerCase();
    state.draft.telegramId = lower === "none" || lower === "-" ? AUTO_TELEGRAM_ID_MARKER : trimmed;
    state.step = "expiresAt";
    await adminStateService.set(admin.identity.telegramId, state);
    await ctx.reply(generateUserPrompts.expiresAt, { parse_mode: "Markdown" });
    return true;
  }

  const parsed = parseGenerateExpiry(text);
  if (!parsed.ok) {
    await ctx.reply(parsed.error, { parse_mode: "Markdown" });
    return true;
  }

  state.draft.expiresAt = parsed.value;
  await adminStateService.delete(admin.identity.telegramId);

  try {
    await finishGenerateUserFlow(ctx, admin, state.draft);
  } catch (error) {
    logger.error({ error }, "Failed to finalize generated user");
    await ctx.reply(messages.unknownError);
  }

  return true;
}

async function handleAdminFlowMessage(ctx: BotContext): Promise<boolean> {
  const admin = await getAdminIdentity(ctx);

  if (!admin) {
    return false;
  }

  const state = await adminStateService.get(admin.identity.telegramId);

  if (!state) {
    return false;
  }

  const text = ctx.message?.text?.trim() ?? "";

  if (!text) {
    return true;
  }

  if (text.startsWith("/")) {
    if (text === "/cancel") {
      await adminStateService.delete(admin.identity.telegramId);
      await ctx.reply(adminMessages.cancelled);
      return true;
    }

    await ctx.reply(adminMessages.flowInProgress, { parse_mode: "Markdown" });
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

  if (state.kind === "generateuser") {
    return handleGenerateUserState(ctx, admin, state, text);
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

    const labels = adminMessages.cardLabels;
    const [telegramId, lookup] = parseCommandArgs(ctx.message?.text);

    if (telegramId && lookup) {
      const result = await adminService.bindImportedClient(admin.adminUser.id, telegramId, lookup);

      if (!result.ok) {
        await ctx.reply(describeBindError(result.reason));
        return;
      }

      await ctx.reply(
        [
          adminMessages.bindClientDone,
          `${labels.name}: ${result.client.user.fullName}`,
          `${labels.telegramId}: ${result.client.user.telegramId}`,
          `${labels.emailLabel}: ${result.client.emailLabel}`,
          `${labels.uuid}: ${result.client.uuid}`,
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
        await ctx.reply(adminMessages.clientOrUserNotFound);
        return;
      }

      await ctx.reply(adminMessages.expiryUpdated(formatDate(client.expiresAt)));
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
        await ctx.reply(adminMessages.clientOrUserNotFound);
        return;
      }

      await ctx.reply(adminMessages.statusUpdated(client.status.toLowerCase()));
      return;
    }

    await sendUserPicker(ctx, commandKind);
  });

  bot.command("cancel", async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    if (!(await adminStateService.has(admin.identity.telegramId))) {
      await ctx.reply(adminMessages.noActiveFlow);
      return;
    }

    await adminStateService.delete(admin.identity.telegramId);
    await ctx.reply(adminMessages.cancelled);
  });

  bot.command("listusers", async (ctx) => {
    const admin = await getAdminIdentity(ctx);

    if (!admin) {
      return;
    }

    const [rawFilter] = parseCommandArgs(ctx.message?.text);
    const filter = (rawFilter?.toLowerCase() as AdminUserFilter | undefined) ?? null;

    if (filter && ["all", "active", "expired", "disabled", "pending"].includes(filter)) {
      await sendFilteredUserList(ctx, filter);
      return;
    }

    await sendUserFilterPicker(ctx, "listusers");
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
      await ctx.reply(adminMessages.userNotFound);
      return;
    }

    await ctx.reply(await formatAdminUserInfoMessage(user));
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
      await ctx.reply(adminMessages.invalidRequestId);
      return;
    }

    await sendRequestDetails(ctx, requestId);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminRequestApprovePrefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const labels = adminMessages.cardLabels;
    const requestId = parseRequestId(ctx.match?.[1]);
    if (!requestId) {
      await ctx.reply(adminMessages.invalidRequestId);
      return;
    }

    const client = await adminService.approveRequest(admin.adminUser.id, requestId);

    if (!client) {
      await ctx.reply(adminMessages.requestAlreadyHandled);
      return;
    }

    await ctx.reply(
      [
        adminMessages.requestApprovedHeader,
        `${labels.name}: ${client.user.fullName}`,
        `${labels.telegramId}: ${client.user.telegramId}`,
        `${labels.accessUntil}: ${formatDate(client.expiresAt)}`,
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
      await ctx.reply(adminMessages.invalidRequestId);
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

      const labels = adminMessages.cardLabels;
      const selection = parseBindSelection(ctx.match?.[1]);

      if (!selection) {
        await ctx.reply(adminMessages.invalidImportedSelection);
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
            ? adminMessages.requestAlreadyHandled
            : result.reason === "target_already_has_client"
              ? adminMessages.bindRequestAlreadyHasClient
              : adminMessages.importedNotFound;

        await ctx.reply(errorText);
        return;
      }

      await ctx.reply(
        [
          adminMessages.bindRequestDone,
          `${labels.name}: ${result.client.user.fullName}`,
          `${labels.telegramId}: ${result.client.user.telegramId}`,
          `${labels.emailLabel}: ${result.client.emailLabel}`,
          `${labels.uuid}: ${result.client.uuid}`,
        ].join("\n"),
      );

      await ctx.api.sendMessage(result.client.user.telegramId, adminMessages.bindUserNotice, {
        reply_markup: createMainMenuKeyboard(),
      });
    },
  );

  bot.callbackQuery(new RegExp(`^${callbacks.adminRequestRejectPrefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const requestId = parseRequestId(ctx.match?.[1]);
    if (!requestId) {
      await ctx.reply(adminMessages.invalidRequestId);
      return;
    }

    const request = await adminService.rejectRequest(admin.adminUser.id, requestId);

    if (!request) {
      await ctx.reply(adminMessages.requestAlreadyHandled);
      return;
    }

    await ctx.reply(adminMessages.requestRejected(request.id));

    await ctx.api.sendMessage(request.user.telegramId, messages.requestRejected, {
      reply_markup: createMainMenuKeyboard(),
    });
  });

  bot.callbackQuery(callbacks.adminAddUser, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();
    await startAddUserFlow(ctx, admin.identity);
  });

  bot.callbackQuery(callbacks.adminGenerateUser, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();
    await startGenerateUserFlow(ctx, admin.identity);
  });

  bot.command("generate", async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await startGenerateUserFlow(ctx, admin.identity);
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
    await sendUserFilterPicker(ctx, "listusers");
  });

  bot.callbackQuery(callbacks.adminUserInfo, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();
    await sendUserFilterPicker(ctx, "userinfo");
  });

  bot.callbackQuery(
    new RegExp(`^${callbacks.adminListUsersFilterPrefix}(all|active|expired|disabled|pending)$`),
    async (ctx) => {
      const admin = await getAdminIdentity(ctx);
      if (!admin) return;
      await ctx.answerCallbackQuery();

      const filter = ctx.match?.[1] as AdminUserFilter | undefined;
      if (!filter) {
        await ctx.reply(adminMessages.invalidFilter);
        return;
      }

      await sendFilteredUserList(ctx, filter);
    },
  );

  bot.callbackQuery(
    new RegExp(`^${callbacks.adminUserFilterPrefix}(all|active|expired|disabled)$`),
    async (ctx) => {
      const admin = await getAdminIdentity(ctx);
      if (!admin) return;
      await ctx.answerCallbackQuery();

      const filter = ctx.match?.[1] as Exclude<AdminUserFilter, "pending"> | undefined;
      if (!filter) {
        await ctx.reply(adminMessages.invalidFilter);
        return;
      }

      await sendUserPicker(ctx, "userinfo", filter);
    },
  );

  bot.callbackQuery(
    new RegExp(`^${callbacks.adminPickerNavPrefix}(userinfo|setexpiry|disable|enable):(all|active|expired|disabled):(\\d+)$`),
    async (ctx) => {
      const admin = await getAdminIdentity(ctx);
      if (!admin) return;
      await ctx.answerCallbackQuery();

      const action = ctx.match?.[1] as UserPickerAction | undefined;
      const filter = ctx.match?.[2] as Exclude<AdminUserFilter, "pending"> | undefined;
      const page = Number.parseInt(ctx.match?.[3] ?? "0", 10);

      if (!action || !filter || !Number.isInteger(page) || page < 0) {
        await ctx.reply(adminMessages.invalidUserPick);
        return;
      }

      await sendUserPicker(ctx, action, filter, page);
    },
  );

  bot.callbackQuery(
    new RegExp(`^${callbacks.adminPickerNavPrefix}noop:`),
    async (ctx) => {
      await ctx.answerCallbackQuery();
    },
  );

  bot.callbackQuery(new RegExp(`^${callbacks.adminPickUserInfoPrefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const userId = parseUserId(ctx.match?.[1]);
    if (userId === null) {
      await ctx.reply(adminMessages.invalidUserPick);
      return;
    }

    const user = await userService.findById(userId);
    if (!user) {
      await ctx.reply(adminMessages.userNotFound);
      return;
    }

    await ctx.reply(await formatAdminUserInfoMessage(user));
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminPickSetExpiryPrefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const userId = parseUserId(ctx.match?.[1]);
    if (userId === null) {
      await ctx.reply(adminMessages.invalidUserPick);
      return;
    }

    await sendSetExpiryOptions(ctx, userId);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminSetExpiryPlus30Prefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = await resolveTelegramIdFromUserId(ctx.match?.[1]);
    if (!telegramId) {
      await ctx.reply(adminMessages.invalidUserPick);
      return;
    }

    await applyQuickExpiry(ctx, admin, telegramId, 30);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminSetExpiryPlus60Prefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = await resolveTelegramIdFromUserId(ctx.match?.[1]);
    if (!telegramId) {
      await ctx.reply(adminMessages.invalidUserPick);
      return;
    }

    await applyQuickExpiry(ctx, admin, telegramId, 60);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminSetExpiryPlus90Prefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = await resolveTelegramIdFromUserId(ctx.match?.[1]);
    if (!telegramId) {
      await ctx.reply(adminMessages.invalidUserPick);
      return;
    }

    await applyQuickExpiry(ctx, admin, telegramId, 90);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminSetExpiryManualPrefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = await resolveTelegramIdFromUserId(ctx.match?.[1]);
    if (!telegramId) {
      await ctx.reply(adminMessages.invalidUserPick);
      return;
    }

    await startSetExpiryDateFlow(ctx, admin.identity, telegramId);
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminPickDisablePrefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = await resolveTelegramIdFromUserId(ctx.match?.[1]);
    if (!telegramId) {
      await ctx.reply(adminMessages.invalidUserPick);
      return;
    }

    const client = await adminService.setDisabled(admin.adminUser.id, telegramId, true);
    if (!client) {
      await ctx.reply(adminMessages.clientOrUserNotFound);
      return;
    }

    await ctx.reply(adminMessages.statusUpdated(client.status.toLowerCase()));
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminPickEnablePrefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) return;
    await ctx.answerCallbackQuery();

    const telegramId = await resolveTelegramIdFromUserId(ctx.match?.[1]);
    if (!telegramId) {
      await ctx.reply(adminMessages.invalidUserPick);
      return;
    }

    const client = await adminService.setDisabled(admin.adminUser.id, telegramId, false);
    if (!client) {
      await ctx.reply(adminMessages.clientOrUserNotFound);
      return;
    }

    await ctx.reply(adminMessages.statusUpdated(client.status.toLowerCase()));
  });
}

