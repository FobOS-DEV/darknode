import type { IncomingMessage, ServerResponse } from "node:http";

import { logger } from "../config/logger";
import { authService } from "../services/authService";
import { subscriptionService } from "../services/subscriptionService";
import { vpnService } from "../services/vpnService";
import {
  buildSessionCookie,
  clearSessionCookie,
  getClientIp,
  parseCookies,
  readJsonBody,
  sendJson,
} from "./httpUtils";

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

async function requireUser(req: IncomingMessage, res: ServerResponse) {
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

const handlers: Record<string, Handler> = {
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
};

export const apiRoutes = {
  match(req: IncomingMessage): Handler | null {
    const url = (req.url ?? "").split("?")[0]!;
    const key = `${req.method ?? "GET"} ${url}`;
    return handlers[key] ?? null;
  },

  async handle(handler: Handler, req: IncomingMessage, res: ServerResponse) {
    try {
      await handler(req, res);
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
