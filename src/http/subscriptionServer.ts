import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { subscriptionService } from "../services/subscriptionService";

const SUB_PATH_PATTERN = /^\/sub\/([A-Za-z0-9_-]+)\/?$/;

function send(res: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8") {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
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
    // Hiddify reads Profile-Title; raw UTF-8 works with current clients.
    // Encode as base64 with the RFC 8187 prefix for stricter implementations.
    res.setHeader("Profile-Title", env.subProfileTitle);
    res.setHeader(
      "Profile-Title-Base64",
      Buffer.from(env.subProfileTitle, "utf8").toString("base64"),
    );
  }
  send(res, 200, result.content);
}

function handleRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "method not allowed");
    return;
  }

  const url = req.url ?? "/";

  if (url === "/healthz") {
    send(res, 200, "ok");
    return;
  }

  const match = SUB_PATH_PATTERN.exec(url);

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
