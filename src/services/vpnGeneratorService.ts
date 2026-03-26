import { randomUUID } from "node:crypto";

import { env } from "../config/env";
import type { VpnClientInput } from "./vpnService";

function slugifyLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
}

export const vpnGeneratorService = {
  generateForUser(params: {
    telegramId: string;
    fullName: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }): VpnClientInput {
    const uuid = randomUUID();
    const labelBase = params.username || params.fullName || params.telegramId;
    const displayName = params.fullName || params.username || params.telegramId;
    const emailLabel = `tg-${params.telegramId}`;
    const label = encodeURIComponent(slugifyLabel(labelBase) || params.telegramId);
    const expiresAt = new Date(Date.now() + env.vpnDefaultExpiryDays * 24 * 60 * 60 * 1000);

    const query = new URLSearchParams({
      security: "reality",
      sni: env.vpnSni,
      fp: env.vpnFingerprint,
      pbk: env.vpnPublicKey,
      sid: env.vpnShortId,
      type: "tcp",
      flow: env.vpnFlow,
      encryption: "none",
    });

    const vlessUrl = `vless://${uuid}@${env.vpnServerHost}:${env.vpnServerPort}?${query.toString()}#${label}`;

    return {
      telegramId: params.telegramId,
      username: params.username,
      firstName: params.firstName,
      lastName: params.lastName,
      fullName: params.fullName,
      displayName,
      emailLabel,
      uuid,
      vlessUrl,
      server: env.vpnServerHost,
      port: env.vpnServerPort,
      publicKey: env.vpnPublicKey,
      shortId: env.vpnShortId,
      sni: env.vpnSni,
      flow: env.vpnFlow,
      expiresAt,
    };
  },
};
