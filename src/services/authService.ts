import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../db/prisma";
import { emailService } from "./emailService";
import { subscriptionService } from "./subscriptionService";
import { vpnGeneratorService } from "./vpnGeneratorService";
import { vpnService } from "./vpnService";
import { xraySyncService } from "./xraySyncService";

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 1 << 14; // 16384, default-ish for node:crypto

function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST });
  return `scrypt$${SCRYPT_COST}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") {
    return false;
  }
  const cost = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(cost)) {
    return false;
  }
  const salt = Buffer.from(parts[2], "hex");
  const expected = Buffer.from(parts[3], "hex");
  if (expected.length === 0) {
    return false;
  }
  const actual = scryptSync(plain, salt, expected.length, { N: cost });
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) && raw.length <= 254;
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function buildSiteFullName(email: string): string {
  return email.split("@")[0]!.slice(0, 32);
}

export type AuthError =
  | "invalid_email"
  | "invalid_password"
  | "email_taken"
  | "code_invalid"
  | "code_expired"
  | "user_not_found"
  | "not_verified"
  | "wrong_password";

export type RegisterResult =
  | { ok: true; pendingVerification: true; userId: number }
  | { ok: false; error: AuthError };

export type VerifyResult =
  | { ok: true; session: { token: string; expiresAt: Date }; userId: number }
  | { ok: false; error: AuthError };

export type LoginResult =
  | { ok: true; session: { token: string; expiresAt: Date }; userId: number }
  | { ok: false; error: AuthError };

async function createSession(userId: number, meta: { ip?: string; userAgent?: string }) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });
  return { token, expiresAt };
}

export const authService = {
  async register(input: { email: string; password: string }): Promise<RegisterResult> {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) {
      return { ok: false, error: "invalid_email" };
    }
    if (input.password.length < 8) {
      return { ok: false, error: "invalid_password" };
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.emailVerifiedAt) {
        return { ok: false, error: "email_taken" };
      }
      // Re-issue code for a pending registration: keep user, rotate code.
      const code = generateCode();
      await prisma.emailVerification.create({
        data: {
          userId: existing.id,
          code,
          expiresAt: new Date(Date.now() + env.verificationTtlMinutes * 60 * 1000),
        },
      });
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: hashPassword(input.password) },
      });
      const { subject, textBody, htmlBody } = emailService.buildVerificationEmail(code);
      const sendResult = await emailService.send({ to: email, subject, textBody, htmlBody });
      if (!sendResult.ok) {
        logger.warn({ email, error: sendResult.error }, "Failed to send verification email");
      }
      return { ok: true, pendingVerification: true, userId: existing.id };
    }

    const fullName = buildSiteFullName(email);
    const user = await prisma.user.create({
      data: {
        telegramId: `web:${email}`,
        email,
        passwordHash: hashPassword(input.password),
        fullName,
        source: "web",
      },
    });

    const code = generateCode();
    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        code,
        expiresAt: new Date(Date.now() + env.verificationTtlMinutes * 60 * 1000),
      },
    });

    const { subject, textBody, htmlBody } = emailService.buildVerificationEmail(code);
    const sendResult = await emailService.send({ to: email, subject, textBody, htmlBody });
    if (!sendResult.ok) {
      logger.warn({ email, error: sendResult.error }, "Failed to send verification email");
    }

    return { ok: true, pendingVerification: true, userId: user.id };
  },

  async verify(input: {
    email: string;
    code: string;
    ip?: string;
    userAgent?: string;
  }): Promise<VerifyResult> {
    const email = normalizeEmail(input.email);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { ok: false, error: "user_not_found" };
    }

    const candidate = await prisma.emailVerification.findFirst({
      where: {
        userId: user.id,
        code: input.code,
        consumedAt: null,
      },
      orderBy: { id: "desc" },
    });

    if (!candidate) {
      return { ok: false, error: "code_invalid" };
    }
    if (candidate.expiresAt.getTime() < Date.now()) {
      return { ok: false, error: "code_expired" };
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.emailVerification.update({
        where: { id: candidate.id },
        data: { consumedAt: now },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
      }),
    ]);

    // First-time verification triggers VPN provisioning: 7-day probe trial.
    if (!user.emailVerifiedAt) {
      const trialExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const vpnInput = vpnGeneratorService.generateForUser({
        telegramId: user.telegramId,
        username: user.username ?? undefined,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        fullName: user.fullName,
      });
      vpnInput.expiresAt = trialExpiry;
      try {
        await vpnService.upsertVpnClient(vpnInput);
        await subscriptionService.ensureForUser(user.id);
        if (xraySyncService.isEnabled()) {
          await xraySyncService.syncAuthorizedClients().catch((error) => {
            logger.warn({ error, userId: user.id }, "Initial gRPC sync after verify failed");
          });
        }
      } catch (error) {
        logger.error({ error, userId: user.id }, "Failed to provision VPN on verify");
      }
    }

    const session = await createSession(user.id, { ip: input.ip, userAgent: input.userAgent });
    return { ok: true, session, userId: user.id };
  },

  async login(input: {
    email: string;
    password: string;
    ip?: string;
    userAgent?: string;
  }): Promise<LoginResult> {
    const email = normalizeEmail(input.email);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return { ok: false, error: "user_not_found" };
    }
    if (!verifyPassword(input.password, user.passwordHash)) {
      return { ok: false, error: "wrong_password" };
    }
    if (!user.emailVerifiedAt) {
      return { ok: false, error: "not_verified" };
    }
    const session = await createSession(user.id, { ip: input.ip, userAgent: input.userAgent });
    return { ok: true, session, userId: user.id };
  },

  async logout(token: string): Promise<void> {
    await prisma.session.deleteMany({ where: { token } });
  },

  async getUserBySession(token: string) {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session) {
      return null;
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
    return session.user;
  },
};
