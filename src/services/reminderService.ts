import { prisma } from "../db/prisma";
import { getDaysLeft, formatDate, isExpired } from "../utils/dates";

const REMINDER_ACTION = "system.expiry_reminder";

type ReminderCandidate = {
  userId: number;
  telegramId: string;
  displayName: string;
  expiresAt: Date;
  daysLeft: number;
};

function buildReminderKey(daysBefore: number, expiresAt: Date): string {
  return `${daysBefore}:${expiresAt.toISOString()}`;
}

function parseReminderKey(payloadJson: string | null): string | null {
  if (!payloadJson) {
    return null;
  }

  try {
    const payload = JSON.parse(payloadJson) as { daysBefore?: number; expiresAt?: string };

    if (typeof payload.daysBefore !== "number" || typeof payload.expiresAt !== "string") {
      return null;
    }

    return `${payload.daysBefore}:${payload.expiresAt}`;
  } catch {
    return null;
  }
}

export const reminderService = {
  async listPendingExpiryReminders(daysBeforeList: number[], now = new Date()): Promise<ReminderCandidate[]> {
    const uniqueDays = [...new Set(daysBeforeList)].filter((value) => value > 0);

    if (uniqueDays.length === 0) {
      return [];
    }

    const maxDays = Math.max(...uniqueDays);
    const maxDate = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);

    const clients = await prisma.vpnClient.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: {
          not: null,
          lte: maxDate,
        },
      },
      include: {
        user: true,
      },
      orderBy: {
        expiresAt: "asc",
      },
    });

    const filtered = clients
      .filter((client) => client.expiresAt && !isExpired(client.expiresAt, now))
      .map((client) => ({
        client,
        daysLeft: getDaysLeft(client.expiresAt, now),
      }))
      .filter(
        (item): item is { client: typeof clients[number] & { expiresAt: Date }; daysLeft: number } =>
          item.daysLeft !== null && uniqueDays.includes(item.daysLeft),
      );

    if (filtered.length === 0) {
      return [];
    }

    const targetUserIds = filtered.map((item) => item.client.userId);
    const logs = await prisma.auditLog.findMany({
      where: {
        action: REMINDER_ACTION,
        targetUserId: {
          in: targetUserIds,
        },
      },
    });

    const sentKeys = new Set(
      logs
        .map((log) => {
          const reminderKey = parseReminderKey(log.payloadJson);
          return reminderKey && log.targetUserId ? `${log.targetUserId}:${reminderKey}` : null;
        })
        .filter((value): value is string => Boolean(value)),
    );

    return filtered
      .filter((item) => !sentKeys.has(`${item.client.userId}:${buildReminderKey(item.daysLeft, item.client.expiresAt)}`))
      .map((item) => ({
        userId: item.client.userId,
        telegramId: item.client.user.telegramId,
        displayName: item.client.displayName,
        expiresAt: item.client.expiresAt,
        daysLeft: item.daysLeft,
      }));
  },

  formatExpiryReminderMessage(params: { displayName: string; daysLeft: number; expiresAt: Date; supportLink: string }) {
    const dayLabel = params.daysLeft === 1 ? "день" : params.daysLeft < 5 ? "дня" : "дней";

    return [
      `Напоминание: доступ VPN для ${params.displayName} истекает через ${params.daysLeft} ${dayLabel}.`,
      `Доступ до: ${formatDate(params.expiresAt)}`,
      `Для продления напишите администратору: ${params.supportLink}`,
    ].join("\n");
  },

  async markExpiryReminderSent(actorUserId: number, targetUserId: number, daysBefore: number, expiresAt: Date) {
    await prisma.auditLog.create({
      data: {
        action: REMINDER_ACTION,
        actorUserId,
        targetUserId,
        payloadJson: JSON.stringify({
          daysBefore,
          expiresAt: expiresAt.toISOString(),
        }),
      },
    });
  },
};
