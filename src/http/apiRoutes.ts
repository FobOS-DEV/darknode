import type { IncomingMessage, ServerResponse } from "node:http";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { adminUserService } from "../services/adminUserService";
import { authService } from "../services/authService";
import { subscriptionService } from "../services/subscriptionService";
import { vpnService } from "../services/vpnService";
import { isAdminTelegramId } from "../utils/auth";
import {
  buildSessionCookie,
  clearSessionCookie,
  getClientIp,
  parseCookies,
  readJsonBody,
  sendJson,
} from "./httpUtils";

type Handler = (req: IncomingMessage, res: ServerResponse, params?: Record<string, string>) => Promise<void>;

type RouteUser = NonNullable<Awaited<ReturnType<typeof authService.getUserBySession>>>;

function isUserAdmin(user: RouteUser): boolean {
  if (user.isAdmin) return true;
  try {
    return isAdminTelegramId(BigInt(user.telegramId));
  } catch {
    return false;
  }
}

async function requireUser(req: IncomingMessage, res: ServerResponse): Promise<RouteUser | null> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.dn_session;
  if (!token) {
    sendJson(res, 401, { error: "unauthorized" });
    return null;
  }
  const user = await authService.getUserBySession(token);
  if (!user) {
    res.setHeader("Set-Cookie", clearSessionCookie());
    sendJson(res, 401, { error: "unauthorized" });
    return null;
  }
  return user;
}

async function requireAdmin(req: IncomingMessage, res: ServerResponse): Promise<RouteUser | null> {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!isUserAdmin(user)) {
    sendJson(res, 403, { error: "forbidden" });
    return null;
  }
  return user;
}

const literalHandlers: Record<string, Handler> = {
  "POST /api/register": async (req, res) => {
    const body = await readJsonBody<{ email?: string; password?: string }>(req);
    if (!body.email || !body.password) {
      sendJson(res, 400, { error: "email_and_password_required" });
      return;
    }
    const result = await authService.register({ email: body.email, password: body.password });
    if (!result.ok) {
      sendJson(res, 400, { error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true, pending: true });
  },

  "POST /api/verify": async (req, res) => {
    const body = await readJsonBody<{ email?: string; code?: string }>(req);
    if (!body.email || !body.code) {
      sendJson(res, 400, { error: "email_and_code_required" });
      return;
    }
    const result = await authService.verify({
      email: body.email,
      code: body.code,
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? undefined,
    });
    if (!result.ok) {
      sendJson(res, 400, { error: result.error });
      return;
    }
    res.setHeader("Set-Cookie", buildSessionCookie(result.session.token, result.session.expiresAt));
    sendJson(res, 200, { ok: true, userId: result.userId });
  },

  "POST /api/login": async (req, res) => {
    const body = await readJsonBody<{ email?: string; password?: string }>(req);
    if (!body.email || !body.password) {
      sendJson(res, 400, { error: "email_and_password_required" });
      return;
    }
    const result = await authService.login({
      email: body.email,
      password: body.password,
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? undefined,
    });
    if (!result.ok) {
      sendJson(res, 401, { error: result.error });
      return;
    }
    res.setHeader("Set-Cookie", buildSessionCookie(result.session.token, result.session.expiresAt));
    sendJson(res, 200, { ok: true, userId: result.userId });
  },

  "POST /api/logout": async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.dn_session) {
      await authService.logout(cookies.dn_session).catch(() => undefined);
    }
    res.setHeader("Set-Cookie", clearSessionCookie());
    sendJson(res, 200, { ok: true });
  },

  "GET /api/me": async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const access = await vpnService.getUserAccessState(user.telegramId);
    const isActive = access.kind === "active";
    const client = access.kind !== "not_found" ? access.client : null;
    sendJson(res, 200, {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        source: user.source,
        emailVerifiedAt: user.emailVerifiedAt,
        isAdmin: isUserAdmin(user),
      },
      vpn: client
        ? {
            status: client.status,
            displayName: client.displayName,
            expiresAt: client.expiresAt,
            active: isActive,
          }
        : null,
    });
  },

  "GET /api/config": async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const access = await vpnService.getUserAccessState(user.telegramId);
    if (access.kind === "not_found") {
      sendJson(res, 404, { error: "no_vpn_client" });
      return;
    }
    const subscription = await subscriptionService.ensureForUser(user.id);
    const subscriptionUrl = subscriptionService.buildPublicUrl(subscription.token);
    const resolved = await subscriptionService.resolveByToken(subscription.token);
    const vlessLines =
      resolved.kind === "ok" && resolved.content
        ? Buffer.from(resolved.content, "base64").toString("utf8").split("\n").filter(Boolean)
        : [];
    const inbounds = await subscriptionService.listVisibleInboundsForUser(user.id);
    sendJson(res, 200, {
      ok: true,
      subscriptionUrl,
      vlessLines,
      uuid: access.client.uuid,
      inbounds: inbounds.map((i) => ({ id: i.id, label: i.label, host: i.host, port: i.port })),
      vpn: {
        status: access.client.status,
        displayName: access.client.displayName,
        expiresAt: access.client.expiresAt,
        active: access.kind === "active",
      },
    });
  },

  "GET /api/admin/overview": async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const overview = await adminUserService.overview();
    sendJson(res, 200, { ok: true, ...overview });
  },

  "GET /api/admin/users": async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const users = await adminUserService.list();
    sendJson(res, 200, { ok: true, users });
  },

  "GET /api/admin/log": async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const entries = await adminUserService.recentLog(80);
    sendJson(res, 200, { ok: true, entries });
  },
};

type Pattern = { method: string; regex: RegExp; handler: Handler };

const patternHandlers: Pattern[] = [
  {
    method: "GET",
    regex: /^\/api\/admin\/users\/([^/]+)$/,
    handler: async (req, res, params) => {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const targetId = adminUserService.parseId(params!.id!);
      if (targetId === null) {
        sendJson(res, 400, { error: "invalid_user_id" });
        return;
      }
      const target = await adminUserService.getById(targetId);
      if (!target) {
        sendJson(res, 404, { error: "user_not_found" });
        return;
      }
      sendJson(res, 200, { ok: true, user: target });
    },
  },
  {
    method: "POST",
    regex: /^\/api\/admin\/users\/([^/]+)\/extend$/,
    handler: async (req, res, params) => {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const targetId = adminUserService.parseId(params!.id!);
      if (targetId === null) {
        sendJson(res, 400, { error: "invalid_user_id" });
        return;
      }
      const body = await readJsonBody<{ days?: number }>(req);
      const days = Number(body.days);
      if (!Number.isInteger(days) || days <= 0 || days > 3650) {
        sendJson(res, 400, { error: "invalid_days" });
        return;
      }
      const result = await adminUserService.extend(admin.id, targetId, days);
      if (!result.ok) {
        sendJson(res, 400, { error: result.reason });
        return;
      }
      sendJson(res, 200, { ok: true, user: result.user });
    },
  },
  {
    method: "POST",
    regex: /^\/api\/admin\/users\/([^/]+)\/(ban|unban)$/,
    handler: async (req, res, params) => {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const targetId = adminUserService.parseId(params!.id!);
      if (targetId === null) {
        sendJson(res, 400, { error: "invalid_user_id" });
        return;
      }
      const banned = params!.action === "ban";
      const result = await adminUserService.setBan(admin.id, targetId, banned);
      if (!result.ok) {
        sendJson(res, 400, { error: result.reason });
        return;
      }
      sendJson(res, 200, { ok: true, user: result.user });
    },
  },
  {
    method: "POST",
    regex: /^\/api\/admin\/users\/([^/]+)\/rotate-uuid$/,
    handler: async (req, res, params) => {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const targetId = adminUserService.parseId(params!.id!);
      if (targetId === null) {
        sendJson(res, 400, { error: "invalid_user_id" });
        return;
      }
      const result = await adminUserService.rotateUuid(admin.id, targetId);
      if (!result.ok) {
        sendJson(res, 400, { error: result.reason });
        return;
      }
      sendJson(res, 200, { ok: true, user: result.user });
    },
  },
];

function paramNamesFor(pattern: RegExp): string[] {
  // Each pattern names its groups inline below in the dispatch helper.
  // For our small set we hard-code names per regex; otherwise inferring from
  // (?<name>...) groups would require a more elaborate path-to-regexp helper.
  const src = pattern.source;
  if (src === /^\/api\/admin\/users\/([^/]+)\/(ban|unban)$/.source) {
    return ["id", "action"];
  }
  return ["id"];
}

export const apiRoutes = {
  match(req: IncomingMessage): { handler: Handler; params?: Record<string, string> } | null {
    const method = req.method ?? "GET";
    const path = (req.url ?? "").split("?")[0]!;
    const literal = literalHandlers[`${method} ${path}`];
    if (literal) return { handler: literal };
    for (const p of patternHandlers) {
      if (p.method !== method) continue;
      const m = p.regex.exec(path);
      if (!m) continue;
      const names = paramNamesFor(p.regex);
      const params: Record<string, string> = {};
      for (let i = 0; i < names.length; i++) params[names[i]!] = m[i + 1]!;
      return { handler: p.handler, params };
    }
    return null;
  },

  async handle(
    match: { handler: Handler; params?: Record<string, string> },
    req: IncomingMessage,
    res: ServerResponse,
  ) {
    try {
      await match.handler(req, res, match.params);
    } catch (error) {
      logger.error({ error, url: req.url, method: req.method }, "API handler failed");
      if (!res.headersSent) {
        sendJson(res, 500, { error: "internal_error" });
      } else {
        res.end();
      }
    }
  },
};

// Silence the unused-import warning if env isn't referenced; it's wired in
// case future routes need it.
void env;
