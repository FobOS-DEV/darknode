import { TelegramBot } from "../types/bot";
import { registerAdminHandler } from "./handlers/admin";
import { registerConfigHandler } from "./handlers/config";
import { registerContactHandler } from "./handlers/contact";
import { registerHelpHandler } from "./handlers/help";
import { registerRequestHandler } from "./handlers/request";
import { registerStartHandler } from "./handlers/start";
import { registerStatusHandler } from "./handlers/status";

export function registerHandlers(bot: TelegramBot) {
  registerStartHandler(bot);
  registerConfigHandler(bot);
  registerStatusHandler(bot);
  registerHelpHandler(bot);
  registerContactHandler(bot);
  registerRequestHandler(bot);
  registerAdminHandler(bot);
}
