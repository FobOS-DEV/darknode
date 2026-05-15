import { callbacks } from "../../constants/callbacks";
import { messages } from "../../constants/messages";
import { logger } from "../../config/logger";
import { prisma } from "../../db/prisma";
import { adminService } from "../../services/adminService";
import {
  inboundAdminService,
  type InboundCreateInput,
  type InboundStatus,
  INBOUND_STATUSES,
} from "../../services/inboundAdminService";
import { subscriptionService } from "../../services/subscriptionService";
import { auditService } from "../../services/auditService";
import { TelegramBot } from "../../types/bot";
import { isAdminTelegramId } from "../../utils/auth";
import { formatDate } from "../../utils/dates";
import {
  createInboundListKeyboard,
  createInboundStatusKeyboard,
} from "../keyboards/inboundMenu";
import { getTelegramIdentity } from "./shared";

type AddInboundField =
  | "label"
  | "inboundTag"
  | "host"
  | "port"
  | "sni"
  | "publicKey"
  | "shortId"
  | "flow"
  | "fingerprint"
  | "xrayApiAddress";

type AddInboundDraft = Partial<InboundCreateInput>;

type AddInboundState = {
  kind: "addinbound";
  step: AddInboundField;
  draft: AddInboundDraft;
};

const ADD_INBOUND_ORDER: AddInboundField[] = [
  "label",
  "inboundTag",
  "host",
  "port",
  "sni",
  "publicKey",
  "shortId",
  "flow",
  "fingerprint",
  "xrayApiAddress",
];

const ADD_INBOUND_PROMPTS: Record<AddInboundField, string> = {
  label: "Введите короткое имя инбаунда (например `Primary`, `EU-1`).",
  inboundTag: "Введите xray inbound tag (то же значение, что в config.json — например `vless-reality-2`).",
  host: "Введите hostname или IP, через который клиенты будут подключаться.",
  port: "Введите порт (например 443 или 8443).",
  sni: "Введите SNI (например `www.cloudflare.com`).",
  publicKey: "Введите Reality public key (`pbk`).",
  shortId: "Введите Reality short id (`sid`).",
  flow: "Введите flow (например `xtls-rprx-vision`).",
  fingerprint: "Введите fingerprint браузера или отправьте `default` для `chrome`.",
  xrayApiAddress: "Адрес gRPC API этого xray (`host:port`). Отправьте `default` для значения из env / авто-детекта.",
};

const OPTIONAL_FIELDS = new Set<AddInboundField>(["fingerprint", "xrayApiAddress"]);

const inboundStates = new Map<string, AddInboundState>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

function parseCommandArgs(text: string | undefined): string[] {
  if (!text) {
    return [];
  }

  return text.split(/\s+/).slice(1);
}

function nextField(current: AddInboundField): AddInboundField | null {
  const idx = ADD_INBOUND_ORDER.indexOf(current);
  return ADD_INBOUND_ORDER[idx + 1] ?? null;
}

function parseStatus(raw: string | undefined): InboundStatus | null {
  if (!raw) {
    return null;
  }

  const normalized = raw.trim().toUpperCase();
  return (INBOUND_STATUSES as string[]).includes(normalized) ? (normalized as InboundStatus) : null;
}

function parseField(field: AddInboundField, raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { ok: false, error: "Пустое значение не подходит. Попробуйте ещё раз." };
  }

  if (OPTIONAL_FIELDS.has(field) && trimmed.toLowerCase() === "default") {
    return { ok: true, value: field === "xrayApiAddress" ? null : undefined };
  }

  if (field === "port") {
    const port = Number(trimmed);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { ok: false, error: "Порт должен быть целым числом 1..65535." };
    }
    return { ok: true, value: port };
  }

  return { ok: true, value: trimmed };
}

function formatInbound(inbound: {
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
  xrayApiAddress: string | null;
  status: string;
  priority: number;
  createdAt: Date;
  deprecatedAt: Date | null;
}): string {
  return [
    `<b>${escapeHtml(inbound.label)}</b> <code>#${inbound.id}</code>`,
    `Статус: <b>${escapeHtml(inbound.status)}</b>`,
    `Tag: <code>${escapeHtml(inbound.inboundTag)}</code>`,
    `Адрес: <code>${escapeHtml(`${inbound.host}:${inbound.port}`)}</code>`,
    `SNI: <code>${escapeHtml(inbound.sni)}</code>`,
    `Public key: <code>${escapeHtml(inbound.publicKey)}</code>`,
    `Short id: <code>${escapeHtml(inbound.shortId)}</code>`,
    `Flow: <code>${escapeHtml(inbound.flow)}</code>`,
    `Fingerprint: ${escapeHtml(inbound.fingerprint)} • network: ${escapeHtml(inbound.network)} • security: ${escapeHtml(inbound.security)}`,
    `gRPC API: ${escapeHtml(inbound.xrayApiAddress ?? "(env / auto)")}`,
    `Priority: ${inbound.priority} • Создан: ${escapeHtml(formatDate(inbound.createdAt))}${inbound.deprecatedAt ? ` • Deprecated: ${escapeHtml(formatDate(inbound.deprecatedAt))}` : ""}`,
  ].join("\n");
}

async function sendInboundList(ctx: any) {
  const inbounds = await inboundAdminService.list();

  if (inbounds.length === 0) {
    await ctx.reply("Инбаундов пока нет. Используйте кнопку ниже, чтобы добавить первый.");
    return;
  }

  const summary = inbounds
    .map((inbound) => `<code>#${inbound.id}</code> ${escapeHtml(inbound.label)} • ${escapeHtml(inbound.status)} • ${escapeHtml(`${inbound.host}:${inbound.port}`)}`)
    .join("\n");

  await ctx.reply(summary, {
    parse_mode: "HTML",
    reply_markup: createInboundListKeyboard(inbounds),
  });
}

async function sendInboundCard(ctx: any, inboundId: number) {
  const inbound = await inboundAdminService.getById(inboundId);

  if (!inbound) {
    await ctx.reply("Инбаунд не найден.");
    return;
  }

  await ctx.reply(formatInbound(inbound), {
    parse_mode: "HTML",
    reply_markup: createInboundStatusKeyboard(inbound.id, inbound.status as InboundStatus),
  });
}

async function startAddInboundFlow(ctx: any, adminTelegramId: string) {
  inboundStates.set(adminTelegramId, {
    kind: "addinbound",
    step: "label",
    draft: {},
  });

  await ctx.reply(
    [
      "Запускаю пошаговое добавление инбаунда.",
      "Отправьте /cancel чтобы прервать. Новый инбаунд создаётся в статусе STANDBY — переведите его в ACTIVE, когда будете готовы.",
      "",
      ADD_INBOUND_PROMPTS.label,
    ].join("\n"),
  );
}

async function handleAddInboundStep(
  ctx: any,
  admin: { identity: { telegramId: string }; adminUser: { id: number } },
  state: AddInboundState,
  text: string,
): Promise<boolean> {
  const parsed = parseField(state.step, text);

  if (!parsed.ok) {
    await ctx.reply(parsed.error);
    return true;
  }

  if (parsed.value !== undefined) {
    (state.draft as Record<string, unknown>)[state.step] = parsed.value;
  }

  const next = nextField(state.step);

  if (next) {
    state.step = next;
    await ctx.reply(ADD_INBOUND_PROMPTS[next]);
    return true;
  }

  try {
    const draft = state.draft as InboundCreateInput;
    const inbound = await inboundAdminService.create(admin.adminUser.id, draft);
    inboundStates.delete(admin.identity.telegramId);
    await ctx.reply(
      [
        `Инбаунд <code>#${inbound.id}</code> создан в статусе <b>STANDBY</b>.`,
        "",
        "Откройте /inbounds и переведите его в ACTIVE, когда инстанс xray готов принимать клиентов.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  } catch (error) {
    inboundStates.delete(admin.identity.telegramId);
    logger.error({ error }, "Failed to create inbound");
    const message = error instanceof Error ? error.message : "неизвестная ошибка";
    await ctx.reply(`Не получилось создать инбаунд: ${message}`);
  }

  return true;
}

async function handleInboundFlowMessage(ctx: any): Promise<boolean> {
  const identity = getTelegramIdentity(ctx);

  if (!identity) {
    return false;
  }

  if (!isAdminTelegramId(BigInt(identity.telegramId))) {
    return false;
  }

  const state = inboundStates.get(identity.telegramId);

  if (!state) {
    return false;
  }

  const text = ctx.message?.text?.trim() ?? "";

  if (!text) {
    return true;
  }

  if (text.startsWith("/")) {
    if (text === "/cancel") {
      inboundStates.delete(identity.telegramId);
      await ctx.reply("Сценарий отменён.");
      return true;
    }

    await ctx.reply("Сейчас активен сценарий добавления инбаунда. Завершите его или отправьте /cancel.");
    return true;
  }

  const adminUser = await adminService.ensureAdminRecord(
    identity.telegramId,
    identity.username,
    identity.firstName,
    identity.lastName,
  );

  return handleAddInboundStep(
    ctx,
    { identity: { telegramId: identity.telegramId }, adminUser: { id: adminUser.id } },
    state,
    text,
  );
}

async function handleRotateSubscription(ctx: any, admin: { adminUser: { id: number } }, telegramId: string) {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { vpnClient: true },
  });

  if (!user) {
    await ctx.reply("Пользователь не найден.");
    return;
  }

  const rotated = await subscriptionService.rotateForUser(user.id);
  const url = subscriptionService.buildPublicUrl(rotated.token);

  await auditService.log("admin.rotate_subscription", admin.adminUser.id, user.id, {
    telegramId,
    subscriptionId: rotated.id,
  });

  let deliveryNote = "";
  try {
    await ctx.api.sendMessage(
      telegramId,
      [
        "Ссылка-подписка обновлена администратором. Старая ссылка больше не работает.",
        "",
        url,
      ].join("\n"),
    );
    deliveryNote = "Новая ссылка отправлена пользователю.";
  } catch (error) {
    logger.warn({ error, telegramId }, "Failed to deliver rotated subscription URL to user");
    deliveryNote = "Не удалось отправить пользователю напрямую — передайте ссылку вручную:";
  }

  await ctx.reply(
    [
      `Подписка для пользователя ${escapeHtml(user.fullName)} (<code>${escapeHtml(telegramId)}</code>) обновлена.`,
      deliveryNote,
      `<code>${escapeHtml(url)}</code>`,
    ].join("\n"),
    { parse_mode: "HTML" },
  );
}

export function registerInboundAdminHandler(bot: TelegramBot) {
  bot.on("message:text", async (ctx, next) => {
    const handled = await handleInboundFlowMessage(ctx);

    if (!handled) {
      await next();
    }
  });

  bot.command("inbounds", async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (admin) {
      await sendInboundList(ctx);
    }
  });

  bot.command("addinbound", async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (admin) {
      await startAddInboundFlow(ctx, admin.identity.telegramId);
    }
  });

  bot.command("setinboundstatus", async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) {
      return;
    }

    const [rawId, rawStatus] = parseCommandArgs(ctx.message?.text);
    const id = Number.parseInt(rawId ?? "", 10);
    const status = parseStatus(rawStatus);

    if (!Number.isInteger(id) || !status) {
      await ctx.reply(
        `Использование: /setinboundstatus <id> <${INBOUND_STATUSES.join("|")}>`,
      );
      return;
    }

    const updated = await inboundAdminService.setStatus(admin.adminUser.id, id, status);

    if (!updated) {
      await ctx.reply("Инбаунд не найден.");
      return;
    }

    await ctx.reply(`Статус инбаунда #${id} → ${updated.status}.`);
  });

  bot.command("rotatesub", async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    if (!admin) {
      return;
    }

    const [telegramId] = parseCommandArgs(ctx.message?.text);

    if (!telegramId) {
      await ctx.reply("Использование: /rotatesub <telegram_id>");
      return;
    }

    await handleRotateSubscription(ctx, admin, telegramId);
  });

  bot.callbackQuery(callbacks.adminInbounds, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    await ctx.answerCallbackQuery();
    if (admin) {
      await sendInboundList(ctx);
    }
  });

  bot.callbackQuery(callbacks.adminInboundAdd, async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    await ctx.answerCallbackQuery();
    if (admin) {
      await startAddInboundFlow(ctx, admin.identity.telegramId);
    }
  });

  bot.callbackQuery(new RegExp(`^${callbacks.adminInboundViewPrefix}(\\d+)$`), async (ctx) => {
    const admin = await getAdminIdentity(ctx);
    await ctx.answerCallbackQuery();
    if (!admin) {
      return;
    }

    const inboundId = Number.parseInt(ctx.match[1], 10);
    await sendInboundCard(ctx, inboundId);
  });

  bot.callbackQuery(
    new RegExp(`^${callbacks.adminInboundSetStatusPrefix}(\\d+):(ACTIVE|STANDBY|DEPRECATED|DISABLED)$`),
    async (ctx) => {
      const admin = await getAdminIdentity(ctx);
      await ctx.answerCallbackQuery();
      if (!admin) {
        return;
      }

      const inboundId = Number.parseInt(ctx.match[1], 10);
      const status = ctx.match[2] as InboundStatus;
      const updated = await inboundAdminService.setStatus(admin.adminUser.id, inboundId, status);

      if (!updated) {
        await ctx.reply("Инбаунд не найден.");
        return;
      }

      await sendInboundCard(ctx, inboundId);
    },
  );
}
