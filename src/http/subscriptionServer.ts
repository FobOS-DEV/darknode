import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { subscriptionService } from "../services/subscriptionService";
import { apiRoutes } from "./apiRoutes";
import { handlePreflight, sendText, setCors } from "./httpUtils";

const SUB_PATH_PATTERN = /^\/sub\/([A-Za-z0-9_-]+)\/?$/;

function send(res: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8") {
  sendText(res, status, body, contentType);
}

function buildUserInfoHeader(info: { uploadBytes: number; downloadBytes: number; expireUnix: number | null }): string {
  const parts = [`upload=${info.uploadBytes}`, `download=${info.downloadBytes}`];
  if (info.expireUnix !== null) {
    parts.push(`expire=${info.expireUnix}`);
  }
  return parts.join("; ");
}

async function handleSubscription(token: string, res: ServerResponse) {
  const result = await subscriptionService.resolveByToken(token);

  if (result.kind === "not_found") {
    send(res, 404, "not found");
    return;
  }

  if (result.kind === "revoked") {
    send(res, 410, "revoked");
    return;
  }

  res.setHeader("Profile-Update-Interval", "12");
  res.setHeader("Subscription-Userinfo", buildUserInfoHeader(result.userInfo));
  if (env.subProfileTitle) {
    const title = env.subProfileTitle;
    const base64 = Buffer.from(title, "utf8").toString("base64");
    // Node's HTTP layer rejects non-ASCII bytes in header values, so we
    // either send the raw title (if pure ASCII) or Hiddify's `base64:`
    // prefix form. A Profile-Title-Base64 companion header covers clients
    // that look there explicitly.
    // eslint-disable-next-line no-control-regex
    const isAscii = /^[\x20-\x7e]*$/.test(title);
    res.setHeader("Profile-Title", isAscii ? title : `base64:${base64}`);
    res.setHeader("Profile-Title-Base64", base64);
  }
  send(res, 200, result.content);
}

function handleRequest(req: IncomingMessage, res: ServerResponse) {
  setCors(req, res, env.siteOrigin);

  if (req.method === "OPTIONS") {
    handlePreflight(req, res, env.siteOrigin);
    return;
  }

  const url = req.url ?? "/";
  const path = url.split("?")[0]!;

  if (path === "/healthz") {
    send(res, 200, "ok");
    return;
  }

  if (path.startsWith("/api/")) {
    const matched = apiRoutes.match(req);
    if (!matched) {
      send(res, 404, JSON.stringify({ error: "not_found" }), "application/json; charset=utf-8");
      return;
    }
    void apiRoutes.handle(matched, req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "method not allowed");
    return;
  }

  const match = SUB_PATH_PATTERN.exec(path);
  if (match) {
    handleSubscription(match[1], res).catch((error) => {
      logger.error({ error, token: match[1] }, "Subscription handler failed");
      send(res, 500, "internal error");
    });
    return;
  }

  send(res, 404, "not found");
}

export function startSubscriptionServer(): Server {
  const server = createServer(handleRequest);

  server.on("error", (error) => {
    logger.error({ error }, "Subscription HTTP server error");
  });

  server.listen(env.subHttpPort, env.subHttpHost, () => {
    logger.info(
      { host: env.subHttpHost, port: env.subHttpPort, publicBase: env.subBaseUrl },
      "Subscription HTTP server listening",
    );
  });

  return server;
}
