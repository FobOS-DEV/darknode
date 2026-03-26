import type { VpnStatusValue } from "../services/vpnService";

import { formatDate, getDaysLeft } from "./dates";

export function formatStatusLabel(status: VpnStatusValue): string {
  if (status === "ACTIVE") {
    return "активен";
  }

  if (status === "EXPIRED") {
    return "истёк";
  }

  return "отключён";
}

export function formatStatusMessage(params: {
  displayName: string;
  status: VpnStatusValue;
  createdAt: Date;
  expiresAt: Date | null;
}): string {
  const daysLeft = getDaysLeft(params.expiresAt);
  const daysLeftLine = daysLeft === null ? "" : `\nОсталось дней: ${Math.max(daysLeft, 0)}`;

  return [
    `Имя: ${params.displayName}`,
    `Статус: ${formatStatusLabel(params.status)}`,
    `Дата выдачи: ${formatDate(params.createdAt)}`,
    `Доступ до: ${formatDate(params.expiresAt)}`,
  ].join("\n") + daysLeftLine;
}
