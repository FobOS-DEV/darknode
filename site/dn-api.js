// dn-api.js — thin fetch wrapper around the bot's /api/* endpoints.
(function () {
  const API_BASE = window.DN_API_BASE || "";

  async function call(method, path, body) {
    const init = {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(API_BASE + path, init);
    } catch (err) {
      return { ok: false, status: 0, error: "network_error" };
    }
    let json = {};
    try {
      json = await res.json();
    } catch (_) {
      /* ignore */
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: json && json.error ? json.error : "request_failed" };
    }
    return { ok: true, status: res.status, data: json };
  }

  window.dnApi = {
    register: (email, password) => call("POST", "/api/register", { email, password }),
    verify:   (email, code)     => call("POST", "/api/verify",   { email, code }),
    login:    (email, password) => call("POST", "/api/login",    { email, password }),
    logout:   ()                => call("POST", "/api/logout"),
    me:       ()                => call("GET",  "/api/me"),
    config:   ()                => call("GET",  "/api/config"),

    admin: {
      overview:   ()         => call("GET",  "/api/admin/overview"),
      users:      ()         => call("GET",  "/api/admin/users"),
      user:       (id)       => call("GET",  `/api/admin/users/${encodeURIComponent(id)}`),
      log:        ()         => call("GET",  "/api/admin/log"),
      extend:     (id, days) => call("POST", `/api/admin/users/${encodeURIComponent(id)}/extend`, { days }),
      ban:        (id)       => call("POST", `/api/admin/users/${encodeURIComponent(id)}/ban`),
      unban:      (id)       => call("POST", `/api/admin/users/${encodeURIComponent(id)}/unban`),
      rotateUuid: (id)       => call("POST", `/api/admin/users/${encodeURIComponent(id)}/rotate-uuid`),
    },
  };

  // Human-readable mapping for error codes coming back from the API.
  window.DN_ERROR_LABELS = {
    invalid_email:               "неверный формат email",
    invalid_password:            "пароль слишком короткий (мин. 8 символов)",
    email_taken:                 "этот email уже зарегистрирован",
    code_invalid:                "код неверный",
    code_expired:                "срок действия кода истёк",
    user_not_found:              "пользователь не найден",
    not_verified:                "почта не подтверждена — введи код из письма",
    wrong_password:              "неверный пароль",
    email_and_password_required: "email и пароль обязательны",
    email_and_code_required:     "email и код обязательны",
    unauthorized:                "сессия истекла, войди заново",
    no_vpn_client:               "VPN-клиент ещё не создан",
    network_error:               "нет связи с сервером",
    internal_error:              "что-то пошло не так, попробуй ещё раз",
    request_failed:              "запрос не прошёл",
  };
})();
