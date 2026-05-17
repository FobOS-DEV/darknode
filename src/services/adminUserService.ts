import { prisma } from "../db/prisma";
import { auditService } from "./auditService";
import { subscriptionService } from "./subscriptionService";
import { vpnService } from "./vpnService";
import { xraySyncService } from "./xraySyncService";

export type AdminUserShape = {
  id: string;
  rawId: number;
  email: string | null;
  fullName: string;
  telegramId: string | null;
  source: string;
  plan: "trial" | "standard" | "annual";
  status: "active" | "trial" | "expiring" | "expired" | "banned";
  days: number;
  created: string;
  lastSeen: string;
  tgb: number;
  devices: number;
  extensions: number;
  node: string;
  uuid: string | null;
};

function buildId(userId: number): string {
  return `u_${userId.toString(16).padStart(4, "0")}`;
}

function parseId(id: string): number | null {
  const match = /^u_([0-9a-f]+)$/i.exec(id);
  if (!match) {
    const direct = Number.parseInt(id, 10);
    return Number.isInteger(direct) ? direct : null;
  }
  return Number.parseInt(match[1]!, 16);
}

function daysUntil(target: Date | null): number {
  if (!target) return 9999;
  const diff = target.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function relativeAgo(d: Date | null): string {
  if (!d) return "—";
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function planFromContext(input: {
  source: string;
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
  extensionCount: number;
}): "trial" | "standard" | "annual" {
  if (!input.expiresAt) return "annual";
  const lifetimeDays = Math.round(
    (input.expiresAt.getTime() - input.createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (lifetimeDays >= 300) return "annual";
  if (input.source === "web" && input.extensionCount === 0) return "trial";
  return "standard";
}

function statusFromContext(input: {
  vpnStatus: string;
  daysLeft: number;
  plan: "trial" | "standard" | "annual";
}): "active" | "trial" | "expiring" | "expired" | "banned" {
  if (input.vpnStatus === "DISABLED") return "banned";
  if (input.vpnStatus === "EXPIRED" || input.daysLeft < 0) return "expired";
  if (input.daysLeft <= 3) return "expiring";
  if (input.plan === "trial") return "trial";
  return "active";
}

async function shapeUser(user: {
  id: number;
  telegramId: string;
  email: string | null;
  fullName: string;
  source: string;
  createdAt: Date;
  vpnClient: {
    uuid: string;
    status: string;
    createdAt: Date;
    expiresAt: Date | null;
  } | null;
}): Promise<AdminUserShape> {
  const expiresAt = user.vpnClient?.expiresAt ?? null;
  const vpnStatus = user.vpnClient?.status ?? "NONE";
  const days = daysUntil(expiresAt);

  const [latestSnapshot, lastSession, extensionCount] = await Promise.all([
    prisma.trafficSnapshot.findFirst({
      where: { userId: user.id },
      orderBy: { capturedAt: "desc" },
    }),
    prisma.session.findFirst({
      where: { userId: user.id },
      orderBy: { lastSeenAt: { sort: "desc", nulls: "last" } },
    }),
    prisma.auditLog.count({
      where: { action: "admin.set_expiry", targetUserId: user.id },
    }),
  ]);

  const plan = planFromContext({
    source: user.source,
    status: vpnStatus,
    createdAt: user.vpnClient?.createdAt ?? user.createdAt,
    expiresAt,
    extensionCount,
  });

  const status = statusFromContext({ vpnStatus, daysLeft: days, plan });

  return {
    id: buildId(user.id),
    rawId: user.id,
    email: user.email,
    fullName: user.fullName,
    telegramId: user.telegramId,
    source: user.source,
    plan,
    status,
    days,
    created: isoDate(user.vpnClient?.createdAt ?? user.createdAt),
    lastSeen: relativeAgo(lastSession?.lastSeenAt ?? lastSession?.createdAt ?? null),
    tgb: latestSnapshot ? Math.round((Number(latestSnapshot.totalBytes) / 1e9) * 10) / 10 : 0,
    devices: 1,
    extensions: extensionCount,
    node: "STO-01",
    uuid: user.vpnClient?.uuid ?? null,
  };
}

export const adminUserService = {
  parseId,
  buildId,

  async list(): Promise<AdminUserShape[]> {
    const users = await prisma.user.findMany({
      include: { vpnClient: true },
      where: {
        // Exclude placeholder imported:/manual: artifacts when their VpnClient
        // is missing — those are admin-bookkeeping stubs, not real customers.
        OR: [{ vpnClient: { isNot: null } }, { email: { not: null } }],
      },
      orderBy: { id: "asc" },
    });
    return Promise.all(users.map((u) => shapeUser(u)));
  },

  async getById(id: number) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { vpnClient: true },
    });
    if (!user) return null;
    return shapeUser(user);
  },

  async overview() {
    const users = await this.list();
    const total = users.length;
    const active = users.filter((u) => u.status === "active").length;
    const trial = users.filter((u) => u.status === "trial").length;
    const expiring = users.filter((u) => u.status === "expiring").length;
    const expired = users.filter((u) => u.status === "expired").length;
    const banned = users.filter((u) => u.status === "banned").length;
    const trafficGb = Math.round(users.reduce((s, u) => s + u.tgb, 0));
    return { total, active, trial, expiring, expired, banned, trafficGb };
  },

  async extend(actorUserId: number, targetUserId: number, days: number) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { vpnClient: true },
    });
    if (!target?.vpnClient) {
      return { ok: false as const, reason: "user_not_found" as const };
    }
    const now = new Date();
    const baseline =
      target.vpnClient.expiresAt && target.vpnClient.expiresAt.getTime() > now.getTime()
        ? target.vpnClient.expiresAt
        : now;
    const nextExpiry = new Date(baseline.getTime() + days * 24 * 60 * 60 * 1000);
    const updated = await vpnService.setExpiry(target.telegramId, nextExpiry);
    if (!updated) {
      return { ok: false as const, reason: "vpn_update_failed" as const };
    }
    await auditService.log("admin.set_expiry", actorUserId, target.id, {
      days,
      expiresAt: nextExpiry.toISOString(),
      via: "web",
    });
    if (xraySyncService.isEnabled()) {
      await xraySyncService.syncAuthorizedClients().catch(() => undefined);
    }
    return { ok: true as const, user: await this.getById(target.id) };
  },

  async setBan(actorUserId: number, targetUserId: number, banned: boolean) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { vpnClient: true },
    });
    if (!target?.vpnClient) {
      return { ok: false as const, reason: "user_not_found" as const };
    }
    const newStatus = banned ? "DISABLED" : "ACTIVE";
    const updated = await vpnService.setStatus(target.telegramId, newStatus);
    if (!updated) {
      return { ok: false as const, reason: "vpn_update_failed" as const };
    }
    await auditService.log(banned ? "admin.disable_user" : "admin.enable_user", actorUserId, target.id, {
      via: "web",
    });
    if (xraySyncService.isEnabled()) {
      await xraySyncService.syncAuthorizedClients().catch(() => undefined);
    }
    return { ok: true as const, user: await this.getById(target.id) };
  },

  async rotateUuid(actorUserId: number, targetUserId: number) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { vpnClient: true },
    });
    if (!target?.vpnClient) {
      return { ok: false as const, reason: "user_not_found" as const };
    }
    const newUuid = crypto.randomUUID();
    await prisma.vpnClient.update({
      where: { id: target.vpnClient.id },
      data: { uuid: newUuid },
    });
    await auditService.log("admin.rotate_uuid", actorUserId, target.id, {
      oldUuid: target.vpnClient.uuid,
      newUuid,
      via: "web",
    });
    // Refresh subscription so existing subscription URL keeps working but
    // delivers the new UUID on next pull; the gRPC sync below pushes the
    // new UUID to xray and removes the old one.
    await subscriptionService.ensureForUser(target.id);
    if (xraySyncService.isEnabled()) {
      await xraySyncService.syncAuthorizedClients().catch(() => undefined);
    }
    return { ok: true as const, user: await this.getById(target.id) };
  },

  async recentLog(limit = 50) {
    const entries = await prisma.auditLog.findMany({
      orderBy: { id: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        actorUser: { select: { fullName: true, isAdmin: true, telegramId: true } },
        targetUser: { select: { email: true, fullName: true } },
      },
    });
    return entries.map((entry) => ({
      id: entry.id,
      t: entry.createdAt.toISOString(),
      action: entry.action,
      who: entry.targetUser?.email ?? entry.targetUser?.fullName ?? "—",
      actor: entry.actorUser?.isAdmin ? "admin" : "system",
      payload: entry.payloadJson,
    }));
  },
};
