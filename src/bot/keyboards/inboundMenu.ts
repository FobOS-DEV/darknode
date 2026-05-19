import { InlineKeyboard } from "grammy";

import { callbacks } from "../../constants/callbacks";
import type { InboundStatus } from "../../services/inboundAdminService";

const STATUS_TRANSITIONS: Record<InboundStatus, InboundStatus[]> = {
  ACTIVE: ["STANDBY", "DEPRECATED", "DISABLED"],
  STANDBY: ["ACTIVE", "DEPRECATED", "DISABLED"],
  DEPRECATED: ["STANDBY", "DISABLED"],
  DISABLED: ["STANDBY"],
};

const STATUS_LABELS: Record<InboundStatus, string> = {
  ACTIVE: "В работу",
  STANDBY: "В резерв",
  DEPRECATED: "Вывести из эксплуатации",
  DISABLED: "Отключить",
};

export function createInboundListKeyboard(
  inbounds: Array<{ id: number; label: string; status: string; host: string; port: number }>,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const inbound of inbounds.slice(0, 30)) {
    keyboard
      .text(
        `${inbound.label} • ${inbound.status} • ${inbound.host}:${inbound.port}`,
        `${callbacks.adminInboundViewPrefix}${inbound.id}`,
      )
      .row();
  }

  keyboard.text("Добавить инбаунд", callbacks.adminInboundAdd);

  return keyboard;
}

export function createInboundStatusKeyboard(
  inboundId: number,
  currentStatus: InboundStatus,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const allowed = STATUS_TRANSITIONS[currentStatus] ?? [];

  for (const status of allowed) {
    keyboard.text(STATUS_LABELS[status], `${callbacks.adminInboundSetStatusPrefix}${inboundId}:${status}`);
    keyboard.row();
  }

  keyboard.text("К списку инбаундов", callbacks.adminInbounds);

  return keyboard;
}
