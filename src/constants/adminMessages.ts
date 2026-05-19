import type { AdminUserFilter } from "../services/adminService";

export const adminMessages = {
  cancelHint: "Отправьте `/cancel`, если захотите отменить сценарий.",
  cancelled: "Сценарий отменён.",
  noActiveFlow: "Активного сценария сейчас нет.",
  flowInProgress:
    "Сейчас активен админский сценарий. Завершите его или отправьте `/cancel`.",
  emptyValue: "Пустое значение не подходит. Попробуйте ещё раз.",
  invalidPort: "Порт должен быть целым числом.",
  invalidDate: "Некорректная дата. Используйте формат YYYY-MM-DD или `none`.",
  invalidRequestId: "Некорректный идентификатор заявки.",
  invalidUserPick: "Некорректный выбор пользователя.",
  invalidImportedSelection: "Некорректный выбор imported-клиента.",
  invalidFilter: "Некорректный фильтр.",

  enterTelegramId: "Введите Telegram ID пользователя.",
  enterTelegramIdOptional:
    "Введите Telegram ID пользователя или отправьте `none` / `-`, если у пользователя нет Telegram (тогда будет сгенерирован служебный идентификатор).",
  enterFullName: "Введите полное имя пользователя.",
  enterDisplayName: "Введите display name для VPN-клиента.",
  enterEmailLabel: "Введите email label.",
  enterUuid: "Введите UUID клиента.",
  enterVlessUrl: "Вставьте полный VLESS URL.",
  enterServer: "Введите адрес сервера.",
  enterPort: "Введите порт, например 443.",
  enterPublicKey: "Введите public key.",
  enterShortId: "Введите short id.",
  enterSni: "Введите SNI.",
  enterFlow: "Введите flow, например xtls-rprx-vision.",
  enterExpiry: "Введите дату окончания в формате YYYY-MM-DD или `none`.",

  enterBindLookup:
    "Введите email label, UUID или imported:... идентификатор клиента.",
  enterBindTarget:
    "Введите Telegram ID пользователя, к которому нужно привязать существующего клиента.",

  startGenerateUser:
    "Запускаю генерацию конфига. Бот сам подставит UUID, server и ключи Reality из настроек.",
  enterExpiryShort:
    "Введите срок действия: число дней (`30`, `60`, `90`), `none` (бессрочно), `default` (по умолчанию из настроек) или дату в формате `YYYY-MM-DD`.",
  generatedHeader: "Конфиг создан.",
  generatedNotifyUser: "Конфиг создан. Нажмите /start, чтобы получить его.",
  startAddUser: "Запускаю пошаговое импортирование существующего конфига.",
  startSetExpiry: "Запускаю пошаговое изменение срока действия.",
  startSetExpiryDate: "Введите новую дату окончания в формате YYYY-MM-DD или `none`.",
  startDisable: "Запускаю пошаговое отключение пользователя.",
  startEnable: "Запускаю пошаговое включение пользователя.",
  startUserInfo: "Запускаю просмотр карточки пользователя.",
  startBindClient: "Запускаю привязку imported-клиента к реальному Telegram ID.",

  noUsers: "Пользователей пока нет.",
  noPendingRequests: "Новых заявок сейчас нет.",
  noImportedClients: "Свободных imported-клиентов сейчас нет.",
  userNotFound: "Пользователь не найден.",
  clientOrUserNotFound: "Пользователь или VPN-клиент не найден.",
  requestNotFound: "Заявка не найдена.",
  requestAlreadyHandled: "Заявка не найдена или уже обработана.",
  importedNotFound:
    "Imported-клиент не найден. Используйте email label, UUID или imported:... идентификатор.",
  bindTargetNotFound:
    "Целевой пользователь не найден. Пусть он сначала напишет боту /start.",
  bindTargetAlreadyHasClient:
    "У этого Telegram ID уже есть привязанный VPN-клиент.",
  bindRequestAlreadyHasClient:
    "У автора заявки уже есть привязанный VPN-клиент.",

  pickUserForCard: "Выберите пользователя для карточки:",
  pickUserForExpiry: "Выберите пользователя для изменения срока:",
  pickUserForDisable: "Выберите пользователя для отключения:",
  pickUserForEnable: "Выберите пользователя для включения:",
  pickFilterForCard: "Выберите фильтр для карточки пользователя:",
  pickFilterForList: "Выберите фильтр для списка пользователей:",
  pickImportedForRequest: (requestId: number) =>
    `Выберите существующий клиент для заявки #${requestId}:`,

  pendingRequestsHeader: "Новые заявки:",

  expiryOptionsTitle: (params: { fullName: string; current: string }) =>
    [
      `Выберите новый срок для ${params.fullName}.`,
      `Текущий срок: ${params.current}`,
      "",
      "Можно выбрать быстрый вариант или перейти к ручному вводу даты.",
    ].join("\n"),

  expiryQuickApplied: (params: { days: number; newExpiry: string }) =>
    `Срок продлён на ${params.days} дней. Новый срок действия: ${params.newExpiry}.`,
  expiryUpdated: (newExpiry: string) =>
    `Новый срок действия: ${newExpiry}.`,
  statusUpdated: (status: string) => `Статус обновлён: ${status}.`,

  bindClientDone: "Клиент привязан.",
  bindRequestDone: "Существующий клиент привязан к заявке.",
  bindUserNotice:
    "Доступ привязан к вашему Telegram-аккаунту. Откройте /start и получите свой конфиг.",

  requestApprovedHeader: "Заявка одобрена.",
  requestRejected: (id: number) => `Заявка #${id} отклонена.`,

  userSaved: (fullName: string) => `Пользователь сохранён: ${fullName}`,

  filterListHeader: (filter: AdminUserFilter) =>
    `Список по фильтру: ${formatFilterLabel(filter)}`,
  filterEmpty: (filter: AdminUserFilter) =>
    `По фильтру ${formatFilterLabel(filter)} пользователей пока нет.`,

  menuHeader: "Админ-команды:",
  menuLines: [
    "/requests - список новых заявок",
    "/imported - список импортированных клиентов",
    "/bindclient - привязать imported-клиента к реальному Telegram ID",
    "/generate - сгенерировать конфиг (бот сам подставит UUID и ключи)",
    "/adduser - импорт существующего конфига",
    "/setexpiry - изменить срок действия",
    "/disable - отключить пользователя",
    "/enable - включить пользователя",
    "/listusers - все пользователи",
    "/userinfo <telegram_id> - карточка пользователя",
    "/cancel - отменить активный сценарий",
  ],

  cardLabels: {
    name: "Имя",
    telegramId: "Telegram ID",
    username: "Username",
    vpnStatus: "VPN статус",
    accessUntil: "Доступ до",
    trafficIn: "Трафик входящий",
    trafficOut: "Трафик исходящий",
    trafficTotal: "Трафик всего",
    lastSnapshot: "Последний снимок",
    delta24h: "Прирост за 24 часа",
    sharingIps: "Уникальных IP",
    sharingSubnets: "Уникальных сетей",
    sharingLastSeen: "Последнее подключение",
    sharingFlag: "⚠️ Возможно, делится конфигом",
    sharingNoData: "нет данных",
    status: "Статус",
    created: "Создана",
    currentClient: "Текущий клиент",
    requestNumber: "Заявка",
    emailLabel: "Email label",
    uuid: "UUID",
  },

  noClient: "нет клиента",
  noTrafficData: "нет данных",
  noTrafficHistory: "нет истории",
  yes: "есть",
  no: "нет",
};

export function formatFilterLabel(filter: AdminUserFilter): string {
  switch (filter) {
    case "active":
      return "active";
    case "expired":
      return "expired";
    case "disabled":
      return "disabled";
    case "pending":
      return "pending";
    default:
      return "all";
  }
}
