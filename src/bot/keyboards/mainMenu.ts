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
