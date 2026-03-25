import { InlineKeyboard } from "grammy";

import { callbacks } from "../../constants/callbacks";

export function createAdminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Добавить", callbacks.adminAddUser)
    .text("Срок", callbacks.adminSetExpiry)
    .row()
    .text("Отключить", callbacks.adminDisable)
    .text("Включить", callbacks.adminEnable)
    .row()
    .text("Список", callbacks.adminListUsers)
    .text("Карточка", callbacks.adminUserInfo);
}
