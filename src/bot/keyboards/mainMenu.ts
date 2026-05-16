import { InlineKeyboard } from "grammy";

import { env } from "../../config/env";
import { callbacks } from "../../constants/callbacks";

export function createMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Мой конфиг", callbacks.mainConfig)
    .url("Инструкция", env.helpLink)
    .row()
    .text("Статус", callbacks.mainStatus)
    .url("Продлить доступ", env.supportLink);
}

export function createContactKeyboard(): InlineKeyboard {
  return new InlineKeyboard().url("Написать администратору", env.supportLink);
}

export function createRequestAccessKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Подать заявку (если уже оплатили)", callbacks.mainRequestAccess)
    .row()
    .url("Написать администратору", env.supportLink);
}
