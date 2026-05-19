// darknode-screens.jsx — all screen views for DarkNode VPN
// Receives { go, state, setState } props. go(name) navigates.

const { useState: useS, useEffect: useE, useRef: useR } = React;

// ─── shared top chrome ────────────────────────────────────────────────────────
function Top({ left, right, title, sub }) {
  return (
    <div className="dn-top">
      <div className="dn-top-row">
        <div className="dn-top-side">{left}</div>
        <div className="dn-top-center">
          <Logo size={13} glyphOnly />
        </div>
        <div className="dn-top-side dn-top-side-r">{right}</div>
      </div>
      {(title || sub) && (
        <div className="dn-top-meta">
          {title && <div className="dn-top-title">{title}</div>}
          {sub && <div className="dn-top-sub">{sub}</div>}
        </div>
      )}
    </div>
  );
}

function BackBtn({ onClick }) {
  return <button className="dn-back" onClick={onClick}>← BACK</button>;
}

function MenuDots() {
  return <span className="dn-dim" style={{ letterSpacing: 4 }}>···</span>;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1) LANDING
// ═════════════════════════════════════════════════════════════════════════════
function ScreenLanding({ go }) {
  const [bootDone, setBootDone] = useS(false);

  const bootLines = [
    'darknode://route --open',
    'tls.handshake.....OK',
    'reality.cipher.....OK',
    'dpi.bypass.....ENGAGED',
    '> READY',
  ];

  return (
    <div className="dn-screen dn-landing">
      <div className="dn-landing-top">
        <Logo size={14} />
        <span className="dn-dim dn-mono-sm">v2.4.1 · ACCESS</span>
      </div>

      <div className="dn-hero">
        <div className="dn-hero-tag">
          <span className="dn-status-dot dn-status-dot-pulse" />
          UPLINK · {Math.floor(180 + Math.random() * 60)}ms · node STO-01 online
        </div>
        <h1 className="dn-hero-title">
          ОБХОДНОЙ<br/>
          МАРШРУТ<br/>
          <span className="dn-hero-accent">ОТКРЫТ.</span>
        </h1>
        <p className="dn-hero-sub">
          VLESS-туннель через узел в Швеции.<br/>
          Открывает всё, что перекрыли у тебя. Без лагов, без рекламы, без вопросов.
        </p>
      </div>

      <Box title="// BOOT.LOG">
        {bootDone ? (
          <div className="dn-boot">
            {bootLines.map((l, i) => <div key={i} className="dn-boot-l">{l}</div>)}
            <div className="dn-boot-l dn-boot-l-ok">node.darknode.space · маршрут открыт<Caret /></div>
          </div>
        ) : (
          <Boot lines={bootLines} onDone={() => setBootDone(true)} />
        )}
      </Box>

      <div className="dn-features">
        <FeatureRow num="01" k="ALL-ACCESS" v="YouTube, X, Discord, Reddit, Нетфликс, новости — всё, что закрыли, работает." />
        <FeatureRow num="02" k="VLESS+REALITY" v="Свежий протокол. Маскирует трафик под обычный HTTPS." />
        <FeatureRow num="03" k="DPI-NEUTRAL" v="Для блокировок ты выглядишь как запрос на cdn.cloudflare.com. Не ловят." />
        <FeatureRow num="04" k="OPEN-CLIENT" v="Hiddify или Happ. Стандартный VLESS-URI — работает везде." />
      </div>

      <div className="dn-cta">
        <Btn onClick={() => go('register')}>ПОЛУЧИТЬ ПРОБНИК →</Btn>
        <div className="dn-dim dn-mono-sm" style={{ textAlign: 'center', padding: '4px 0' }}>
          // 7 дней бесплатно · без карты · продление через @neshchadin
        </div>
        <button className="dn-link" onClick={() => go('login')}>
          уже внутри? <u>войти</u>
        </button>
      </div>

      <div className="dn-foot">
        <div>──── END·OF·TRANSMISSION ────</div>
        <div className="dn-dim">
          [{new Date().toISOString().replace('T',' ').slice(0,19)}Z] · darknode.space
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ num, k, v }) {
  return (
    <div className="dn-feat">
      <div className="dn-feat-num">{num}</div>
      <div>
        <div className="dn-feat-k">{k}</div>
        <div className="dn-feat-v">{v}</div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2) REGISTER
// ═════════════════════════════════════════════════════════════════════════════
function ScreenRegister({ go, state, setState }) {
  const [email, setEmail] = useS(state.email || '');
  const [pwd, setPwd] = useS('');
  const [pwd2, setPwd2] = useS('');
  const [agree, setAgree] = useS(false);
  const [err, setErr] = useS({});
  const [busy, setBusy] = useS(false);
  const [apiErr, setApiErr] = useS('');

  const submit = async () => {
    const e = {};
    if (!email.includes('@')) e.email = 'неверный формат';
    if (pwd.length < 8) e.pwd = 'минимум 8 символов';
    if (pwd !== pwd2) e.pwd2 = 'не совпадает';
    if (!agree) e.agree = 'требуется';
    setErr(e);
    setApiErr('');
    if (Object.keys(e).length) return;
    setBusy(true);
    const res = await window.dnApi.register(email.trim(), pwd);
    setBusy(false);
    if (!res.ok) {
      setApiErr(window.DN_ERROR_LABELS[res.error] || res.error);
      return;
    }
    setState((s) => ({ ...s, email: email.trim() }));
    go('verify');
  };

  return (
    <div className="dn-screen">
      <Top left={<BackBtn onClick={() => go('landing')} />} right={<MenuDots />} />

      <div className="dn-page">
        <SectionHead num="01" label="ACCESS.REQUEST" right="step 1/2" />
        <h2 className="dn-h2">Открой<br/>канал.</h2>
        <p className="dn-p">
          Почта нужна для входа. После подтверждения
          автоматически выдаётся пробник на 7 дней.
        </p>

        <div className="dn-form">
          <Field
            label="EMAIL"
            value={email}
            onChange={setEmail}
            type="email"
            placeholder="you@example.com"
            error={err.email}
            hint="для входа"
            autoFocus
          />
          <Field
            label="ПАРОЛЬ"
            value={pwd}
            onChange={setPwd}
            type="password"
            placeholder="••••••••"
            error={err.pwd}
            hint="мин. 8"
          />
          <Field
            label="ПОВТОР"
            value={pwd2}
            onChange={setPwd2}
            type="password"
            placeholder="••••••••"
            error={err.pwd2}
          />

          <label className={cls('dn-check', err.agree && 'dn-check-err')} onClick={() => setAgree(!agree)}>
            <span className="dn-check-box">{agree ? '[×]' : '[ ]'}</span>
            <span>
              согласен с <u>условиями</u> и <u>политикой обработки данных</u>.
            </span>
          </label>
        </div>

        {apiErr && <div className="dn-api-err">// {apiErr}</div>}

        <div className="dn-cta">
          <Btn onClick={submit} disabled={busy}>
            {busy ? 'ОТПРАВКА...' : 'ОТПРАВИТЬ КЛЮЧ →'}
          </Btn>
          <button className="dn-link" onClick={() => go('login')}>
            <u>у меня уже есть аккаунт</u>
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3) LOGIN
// ═════════════════════════════════════════════════════════════════════════════
function ScreenLogin({ go, state, setState }) {
  const [email, setEmail] = useS(state.email || '');
  const [pwd, setPwd] = useS('');
  const [err, setErr] = useS({});
  const [busy, setBusy] = useS(false);
  const [apiErr, setApiErr] = useS('');

  const submit = async () => {
    const e = {};
    if (!email.includes('@')) e.email = 'неверный формат';
    if (pwd.length < 1) e.pwd = 'обязательно';
    setErr(e);
    setApiErr('');
    if (Object.keys(e).length) return;
    setBusy(true);
    const res = await window.dnApi.login(email.trim(), pwd);
    setBusy(false);
    if (!res.ok) {
      setApiErr(window.DN_ERROR_LABELS[res.error] || res.error);
      if (res.error === 'not_verified') {
        setState((s) => ({ ...s, email: email.trim() }));
        go('verify');
      }
      return;
    }
    setState((s) => ({ ...s, email: email.trim(), loggedIn: true }));
    go('dashboard');
  };

  return (
    <div className="dn-screen">
      <Top left={<BackBtn onClick={() => go('landing')} />} right={<MenuDots />} />
      <div className="dn-page">
        <SectionHead num="—" label="ACCESS.RETURN" />
        <h2 className="dn-h2">С возвращением.</h2>
        <div className="dn-form">
          <Field label="EMAIL" value={email} onChange={setEmail} type="email" error={err.email} autoFocus />
          <Field label="ПАРОЛЬ" value={pwd} onChange={setPwd} type="password" error={err.pwd} />
        </div>
        {apiErr && <div className="dn-api-err">// {apiErr}</div>}
        <div className="dn-cta">
          <Btn onClick={submit} disabled={busy}>
            {busy ? 'ВХОД...' : 'ВОЙТИ →'}
          </Btn>
          <button className="dn-link" onClick={() => { setState((s) => ({ ...s, email: email.trim() })); go('forgot'); }}>
            <u>забыл пароль</u>
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 4) VERIFY EMAIL
// ═════════════════════════════════════════════════════════════════════════════
function ScreenVerify({ go, state, setState }) {
  const [count, setCount] = useS(45);
  const [code, setCode] = useS(['', '', '', '', '', '']);
  const [busy, setBusy] = useS(false);
  const [apiErr, setApiErr] = useS('');
  const refs = useR([]);

  useE(() => {
    if (count <= 0) return;
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  const setDigit = (i, v) => {
    v = v.replace(/[^0-9]/g, '').slice(0, 1);
    setCode((c) => { const n = [...c]; n[i] = v; return n; });
    if (v && refs.current[i + 1]) refs.current[i + 1].focus();
  };

  const filled = code.every(Boolean);

  const submit = async () => {
    if (!filled) return;
    setApiErr('');
    setBusy(true);
    const res = await window.dnApi.verify(state.email, code.join(''));
    setBusy(false);
    if (!res.ok) {
      setApiErr(window.DN_ERROR_LABELS[res.error] || res.error);
      if (res.error === 'code_invalid' || res.error === 'code_expired') {
        setCode(['', '', '', '', '', '']);
        if (refs.current[0]) refs.current[0].focus();
      }
      return;
    }
    setState((s) => ({ ...s, plan: 'trial', loggedIn: true }));
    go('dashboard');
  };

  const resend = async () => {
    if (!state.email) return;
    setApiErr('');
    const res = await window.dnApi.resendCode(state.email);
    if (!res.ok) {
      setApiErr(window.DN_ERROR_LABELS[res.error] || res.error);
      return;
    }
    setCount(45);
  };

  return (
    <div className="dn-screen">
      <Top left={<BackBtn onClick={() => go('register')} />} right={<MenuDots />} />
      <div className="dn-page">
        <SectionHead num="02" label="MAILBOX.HANDSHAKE" right="step 2/2" />
        <h2 className="dn-h2">Письмо<br/>в пути.</h2>
        <p className="dn-p">
          Шестизначный код отправили на<br/>
          <span className="dn-hl">{state.email || 'you@example.com'}</span>.<br/>
          Не пришло — проверь «Спам» или жди.
        </p>

        <Box title="// INBOX.PREVIEW">
          <div className="dn-mail">
            <div className="dn-mail-from">DARKNODE &lt;noreply@darknode.space&gt;</div>
            <div className="dn-mail-subj">Код подтверждения · 4-3-9-2-1-8</div>
            <div className="dn-mail-body">
              {'>'} Привет.<br/>
              {'>'} Введи код ниже, чтобы<br/>
              {'>'} открыть кабинет.<br/>
              <span className="dn-dim">{'>'} ─── 8&lt;─────────────── ─</span>
            </div>
          </div>
        </Box>

        <div className="dn-code">
          {code.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className="dn-code-cell"
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !d && refs.current[i - 1]) refs.current[i - 1].focus();
              }}
              maxLength={1}
              size={1}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          ))}
        </div>

        <div className="dn-resend">
          {count > 0 ? (
            <span className="dn-dim">повторная отправка через [{String(count).padStart(2, '0')}s]</span>
          ) : (
            <button className="dn-link" onClick={resend}><u>отправить ещё раз</u></button>
          )}
        </div>

        {apiErr && <div className="dn-api-err">// {apiErr}</div>}

        <div className="dn-cta">
          <Btn onClick={submit} disabled={!filled || busy}>
            {busy ? 'ПРОВЕРКА...' : filled ? 'АКТИВИРОВАТЬ ПРОБНИК →' : 'ВВЕДИ КОД'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 5) PLANS
// ═════════════════════════════════════════════════════════════════════════════
function ScreenPlans({ go, state, setState }) {
  const [sel, setSel] = useS('month');
  const openTelegram = () => window.open('https://t.me/neshchadin', '_blank', 'noopener');

  const plans = [
    { id: 'trial',  name: 'PROBE',     price: '0 ₽',    period: '7 дней',  devices: 1, traffic: '10 ГБ',  nodes: 'STO-01 / se', note: 'выдаётся автоматически при регистрации' },
    { id: 'month',  name: 'STANDARD',  price: '100 ₽',  period: 'месяц',   devices: 5, traffic: '∞',      nodes: 'STO-01 / se', note: 'активация вручную' },
    { id: 'year',   name: 'ANNUAL',    price: '999 ₽',  period: 'год',     devices: 5, traffic: '∞',      nodes: 'STO-01 / se + ранний доступ к новым узлам', note: 'год = 2 месяца в подарок', tag: 'BEST' },
  ];
  const currentPlan = state.plan || 'trial';

  return (
    <div className="dn-screen">
      <Top left={<BackBtn onClick={() => go('dashboard')} />} right={<MenuDots />} />
      <div className="dn-page">
        <SectionHead num="—" label="ACCESS.TIERS" right="preview" />
        <h2 className="dn-h2">Тарифы.</h2>
        <p className="dn-p">
          Оплаты через сайт пока нет. Чтобы активировать платный
          тариф — напишите <span className="dn-hl">@neshchadin</span> в Telegram.
        </p>

        <div className="dn-plans">
          {plans.map((p) => {
            const isCurrent = currentPlan === p.id;
            return (
              <button
                key={p.id}
                className={cls('dn-plan', sel === p.id && 'dn-plan-sel')}
                onClick={() => setSel(p.id)}
              >
                <div className="dn-plan-hd">
                  <div className="dn-plan-name">
                    <span className="dn-plan-radio">{sel === p.id ? '◉' : '○'}</span>
                    {p.name}
                    {p.tag && <span className="dn-plan-tag">{p.tag}</span>}
                    {isCurrent && <span className="dn-plan-tag dn-plan-tag-cur">CURRENT</span>}
                  </div>
                  <div className="dn-plan-price">
                    <span className="dn-plan-amount">{p.price}</span>
                    <span className="dn-plan-period"> /{p.period}</span>
                  </div>
                </div>
                <div className="dn-plan-rows">
                  <div className="dn-plan-row"><span className="dn-dim">устройства</span><span>{p.devices}</span></div>
                  <div className="dn-plan-row"><span className="dn-dim">трафик</span><span>{p.traffic}</span></div>
                  <div className="dn-plan-row"><span className="dn-dim">узел</span><span>{p.nodes}</span></div>
                </div>
                <div className="dn-plan-note">// {p.note}</div>
              </button>
            );
          })}
        </div>

        <Box title="// HOW.TO.ACTIVATE">
          <div className="dn-renew">
            <p className="dn-renew-p">
              Платёжный шлюз пока не подключён. Оплаты принимаю
              вручную переводом на Сбер. Напишите мне в Telegram —
              расскажу реквизиты и выдам новый ключ после оплаты.
            </p>
            <button className="dn-tg-btn" onClick={openTelegram}>
              <span className="dn-tg-btn-arrow">↗</span>
              <span className="dn-tg-btn-mid">
                <span className="dn-tg-btn-handle">@neshchadin</span>
                <span className="dn-tg-btn-sub">открыть в Telegram</span>
              </span>
            </button>
          </div>
        </Box>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 6) DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════
function ScreenDashboard({ go, state, setState }) {
  const [me, setMe] = useS(null);
  const [loading, setLoading] = useS(true);
  const openTelegram = () => window.open('https://t.me/neshchadin', '_blank', 'noopener');

  useE(() => {
    let alive = true;
    window.dnApi.me().then((res) => {
      if (!alive) return;
      setLoading(false);
      if (res.ok) {
        setMe(res.data);
        setState((s) => ({ ...s, email: res.data.user.email || s.email, loggedIn: true }));
      } else {
        // Not authed → bounce to landing.
        go('landing');
      }
    });
    return () => { alive = false; };
  }, []);

  const exit = async () => {
    await window.dnApi.logout();
    setState((s) => ({ ...s, loggedIn: false, email: '' }));
    go('landing');
  };

  const vpn = me?.vpn || null;
  const expiresAt = vpn?.expiresAt ? new Date(vpn.expiresAt) : null;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;
  const expires = daysLeft === null ? '—' : daysLeft === 0 ? 'истёк' : `${daysLeft} дн.`;
  const expiringSoon = daysLeft !== null && daysLeft <= 3;
  const planName = vpn?.active ? 'PROBE · 7d trial' : vpn?.status === 'EXPIRED' ? 'EXPIRED' : 'NO ACCESS';

  return (
    <div className="dn-screen dn-dash">
      <Top
        left={<Logo size={13} />}
        right={<button className="dn-link dn-mono-sm" onClick={exit}>EXIT</button>}
      />

      <div className="dn-page">
        <div className="dn-greet">
          <div className="dn-dim dn-mono-sm">{'>'} session.open</div>
          <h2 className="dn-h2-sm">{(me?.user?.email) || state.email || 'agent@darknode.space'}</h2>
          {loading && <div className="dn-dim dn-mono-sm">// loading...</div>}
        </div>

        {/* status card */}
        <Box title="// SUBSCRIPTION" accent>
          <div className="dn-sub">
            <div className="dn-sub-state">
              <Status state={vpn?.active ? 'on' : 'off'} label={vpn?.active ? 'ACTIVE' : (vpn?.status || 'NO ACCESS')} />
              <span className="dn-dim">·</span>
              <span>{planName}</span>
            </div>
            <Rule />
            <div className="dn-sub-rows">
              <KV k="истекает через" v={expires} />
              <KV k="узел" v="STO-01 / se" />
            </div>
          </div>
        </Box>

        {/* renewal call-out */}
        <Box title="// EXTEND.ACCESS">
          <div className="dn-renew">
            <div className="dn-renew-head">
              {expiringSoon
                ? <span className="dn-hl">Пробник заканчивается через {daysLeft} дн.</span>
                : <span>Пробник активен. Продлить — вручную.</span>}
            </div>
            <p className="dn-renew-p">
              Оплатой пока занимаюсь я сам. Чтобы продлить доступ —
              напишите мне в Telegram, расскажу условия и выдам
              новый ключ.
            </p>
            <button className="dn-tg-btn" onClick={openTelegram}>
              <span className="dn-tg-btn-arrow">↗</span>
              <span className="dn-tg-btn-mid">
                <span className="dn-tg-btn-handle">@neshchadin</span>
                <span className="dn-tg-btn-sub">открыть в Telegram</span>
              </span>
            </button>
          </div>
        </Box>

        {/* actions */}
        <div className="dn-actions">
          <ActionCard
            num="01"
            title="ПОДПИСКА VLESS"
            sub="ссылка, QR, ключ"
            onClick={() => go('vless')}
            icon="◇"
          />
          <ActionCard
            num="02"
            title="ИНСТРУКЦИИ"
            sub="Android · iOS"
            onClick={() => go('os')}
            icon="▶"
          />
          <ActionCard
            num="03"
            title="ТАРИФЫ"
            sub="превью планов"
            onClick={() => go('plans')}
            icon="¤"
          />
          <ActionCard
            num="04"
            title="ПРОДЛИТЬ ДОСТУП"
            sub="@neshchadin · Telegram"
            onClick={openTelegram}
            icon="↗"
          />
        </div>

        <Box title="// SIGNALS">
          <div className="dn-sig">
            <SigRow t="14:02" txt="STO-01 · uptime 41 дня" tag="NODE" />
            <SigRow t="вчера"  txt="клиент Hiddify v2.0.5 — обновись" tag="CLIENT" />
            <SigRow t="3 дня"  txt="реролл REALITY-ключа выполнен" tag="OPSEC" />
          </div>
        </Box>
      </div>
    </div>
  );
}

function ActionCard({ num, title, sub, onClick, icon }) {
  return (
    <button className="dn-act" onClick={onClick}>
      <div className="dn-act-num">{num}</div>
      <div className="dn-act-mid">
        <div className="dn-act-title">{title}</div>
        <div className="dn-act-sub">{sub}</div>
      </div>
      <div className="dn-act-arrow">→</div>
    </button>
  );
}

function SigRow({ t, txt, tag }) {
  return (
    <div className="dn-sig-row">
      <span className="dn-dim dn-mono-sm">[{t}]</span>
      <span className="dn-sig-txt">{txt}</span>
      <span className="dn-sig-tag">{tag}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 7) VLESS LINK + QR
// ═════════════════════════════════════════════════════════════════════════════
function ScreenVless({ go }) {
  const [cfg, setCfg] = useS(null);
  const [loading, setLoading] = useS(true);
  const [tab, setTab] = useS('qr'); // qr | uri | sub

  useE(() => {
    let alive = true;
    window.dnApi.config().then((res) => {
      if (!alive) return;
      setLoading(false);
      if (res.ok) setCfg(res.data);
    });
    return () => { alive = false; };
  }, []);

  const vless = (cfg?.vlessLines && cfg.vlessLines[0]) || '';
  const sub = cfg?.subscriptionUrl || '';

  return (
    <div className="dn-screen">
      <Top left={<BackBtn onClick={() => go('dashboard')} />} right={<MenuDots />} />
      <div className="dn-page">
        <SectionHead num="01" label="VLESS.HANDOFF" right="cfg · v2" />
        <h2 className="dn-h2">Твой ключ.</h2>
        <p className="dn-p">
          Импортируй один из трёх способов в Hiddify или Happ.
          QR — самый быстрый. Подписка — обновляется сама.
        </p>

        <div className="dn-tabs">
          {['qr', 'uri', 'sub'].map((k) => (
            <button
              key={k}
              className={cls('dn-tab', tab === k && 'dn-tab-act')}
              onClick={() => setTab(k)}
            >
              {{ qr: '[ QR ]', uri: '[ VLESS-URI ]', sub: '[ SUB-URL ]' }[k]}
            </button>
          ))}
        </div>

        {tab === 'qr' && (
          <Box>
            <div className="dn-qr-wrap">
              <QRGrid data={vless} size={29} />
              <div className="dn-qr-meta">
                <span className="dn-dim">SCAN · DARKNODE</span>
                <span className="dn-dim">err.lvl: M</span>
              </div>
            </div>
            <div className="dn-qr-actions">
              <button className="dn-mini" onClick={() => setTab('uri')}>показать URI →</button>
              <button className="dn-mini">сохранить PNG ↓</button>
            </div>
          </Box>
        )}

        {tab === 'uri' && (
          <Box title="// VLESS.URI">
            <div className="dn-uri">{vless}</div>
            <div className="dn-qr-actions">
              <CopyBtn text={vless}>СКОПИРОВАТЬ ССЫЛКУ</CopyBtn>
            </div>
          </Box>
        )}

        {tab === 'sub' && (
          <Box title="// SUBSCRIPTION.URL">
            <div className="dn-uri">{sub}</div>
            <div className="dn-dim dn-mono-sm" style={{ marginTop: 10 }}>
              ↻ подписка обновляется каждые 24 ч · REALITY-ключ ротируется автоматически
            </div>
            <div className="dn-qr-actions">
              <CopyBtn text={sub}>СКОПИРОВАТЬ SUB</CopyBtn>
            </div>
          </Box>
        )}

        <Box title="// DETAILS">
          <div className="dn-sub-rows">
            <KV k="протокол"  v="VLESS / REALITY" />
            <KV k="узел"      v="STO-01 · se" />
            <KV k="входы"     v={`${cfg?.inbounds?.length ?? '…'} active`} />
            <KV k="UUID"      v={cfg?.uuid ? `${cfg.uuid.slice(0, 18)}…` : '…'} />
            <KV k="истекает"  v={cfg?.vpn?.expiresAt ? new Date(cfg.vpn.expiresAt).toLocaleDateString('ru-RU') : '—'} />
          </div>
          {loading && <div className="dn-dim dn-mono-sm">// loading config...</div>}
        </Box>

        <div className="dn-cta">
          <Btn onClick={() => go('os')}>ДАЛЕЕ: НАСТРОЙКА →</Btn>
          <button className="dn-link" onClick={() => go('dashboard')}>
            <u>обратно в кабинет</u>
          </button>
        </div>
      </div>
    </div>
  );
}

function CopyBtn({ text, children }) {
  const [done, setDone] = useS(false);
  return (
    <button
      className={cls('dn-mini dn-mini-strong', done && 'dn-mini-ok')}
      onClick={() => {
        try { navigator.clipboard.writeText(text); } catch (_) {}
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? '✓ В БУФЕРЕ' : children}
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 8) INSTRUCTIONS — OS picker
// ═════════════════════════════════════════════════════════════════════════════
function ScreenOS({ go, setState }) {
  const pick = (os) => {
    setState((s) => ({ ...s, os }));
    go('app');
  };
  return (
    <div className="dn-screen">
      <Top left={<BackBtn onClick={() => go('dashboard')} />} right={<MenuDots />} />
      <div className="dn-page">
        <SectionHead num="02" label="SETUP.PLATFORM" />
        <h2 className="dn-h2">Где разворачиваем?</h2>
        <p className="dn-p">Выбери ОС. Шаги отличаются — детали важны.</p>

        <div className="dn-pick">
          <PickCard
            tag="ANDROID"
            sub="Google Play / прямой APK"
            glyph={<AndroidGlyph />}
            onClick={() => pick('android')}
          />
          <PickCard
            tag="iOS"
            sub="App Store · iPhone / iPad"
            glyph={<IOSGlyph />}
            onClick={() => pick('ios')}
          />
        </div>

        <Box title="// COMPAT">
          <div className="dn-compat">
            <CompatRow os="Android" v="7.0+ · arm64 / x86_64" ok />
            <CompatRow os="iOS"     v="15.0+ · iPhone · iPad" ok />
            <CompatRow os="MacOS"   v="14.0+ (через Happ-mac)" ok />
            <CompatRow os="Windows" v="скоро · в очереди"      partial />
          </div>
        </Box>
      </div>
    </div>
  );
}

function PickCard({ tag, sub, glyph, onClick }) {
  return (
    <button className="dn-pick-card" onClick={onClick}>
      <div className="dn-pick-glyph">{glyph}</div>
      <div className="dn-pick-meta">
        <div className="dn-pick-tag">{tag}</div>
        <div className="dn-pick-sub">{sub}</div>
      </div>
      <div className="dn-pick-arrow">→</div>
    </button>
  );
}

function AndroidGlyph() {
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
      <rect x="2" y="2" width="38" height="38" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="10" y="14" width="22" height="16" fill="currentColor"/>
      <circle cx="15" cy="11" r="1.4" fill="currentColor"/>
      <circle cx="27" cy="11" r="1.4" fill="currentColor"/>
      <line x1="12" y1="9" x2="14" y2="11" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="30" y1="9" x2="28" y2="11" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="7"  y="18" width="2" height="8" fill="currentColor"/>
      <rect x="33" y="18" width="2" height="8" fill="currentColor"/>
      <rect x="14" y="30" width="2" height="6" fill="currentColor"/>
      <rect x="26" y="30" width="2" height="6" fill="currentColor"/>
    </svg>
  );
}

function IOSGlyph() {
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
      <rect x="11" y="3" width="20" height="36" stroke="currentColor" strokeWidth="1.4" fill="none"/>
      <rect x="14" y="8" width="14" height="22" fill="currentColor"/>
      <circle cx="21" cy="34.5" r="1.6" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <line x1="18" y1="5.5" x2="24" y2="5.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
}

function CompatRow({ os, v, ok, partial }) {
  return (
    <div className="dn-cmpt">
      <span className={cls('dn-cmpt-mark', ok && 'dn-cmpt-ok', partial && 'dn-cmpt-prt')}>
        {ok ? '[✓]' : partial ? '[~]' : '[ ]'}
      </span>
      <span className="dn-cmpt-os">{os}</span>
      <span className="dn-cmpt-v">{v}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 9) INSTRUCTIONS — App picker
// ═════════════════════════════════════════════════════════════════════════════
function ScreenApp({ go, state, setState }) {
  const os = state.os || 'android';
  const pick = (app) => {
    setState((s) => ({ ...s, app }));
    go('setup');
  };
  const apps = [
    { id: 'hiddify', name: 'HIDDIFY', sub: 'мощный, для опытных', note: 'рекомендуем', size: '38 МБ', rating: '★ 4.7' },
    { id: 'happ',    name: 'HAPP',    sub: 'минимальный, чистый',  note: 'самый простой',   size: '12 МБ', rating: '★ 4.6' },
  ];

  return (
    <div className="dn-screen">
      <Top left={<BackBtn onClick={() => go('os')} />} right={<MenuDots />} />
      <div className="dn-page">
        <SectionHead num="03" label="SETUP.CLIENT" right={os.toUpperCase()} />
        <h2 className="dn-h2">Выбери клиента.</h2>
        <p className="dn-p">
          Оба читают VLESS-ссылку и подписку. Если сомневаешься — бери Happ.
        </p>

        <div className="dn-pick">
          {apps.map((a) => (
            <button key={a.id} className="dn-pick-card dn-app-card" onClick={() => pick(a.id)}>
              <div className="dn-app-glyph">{a.name[0]}</div>
              <div className="dn-pick-meta">
                <div className="dn-pick-tag">
                  {a.name}
                  <span className="dn-app-pill">// {a.note}</span>
                </div>
                <div className="dn-pick-sub">{a.sub}</div>
                <div className="dn-app-meta">
                  <span>{a.rating}</span>
                  <span className="dn-dim">·</span>
                  <span>{a.size}</span>
                  <span className="dn-dim">·</span>
                  <span>{os === 'ios' ? 'App Store' : 'Google Play / APK'}</span>
                </div>
              </div>
              <div className="dn-pick-arrow">→</div>
            </button>
          ))}
        </div>

        <Box title="// COMPARISON">
          <div className="dn-cmp">
            <div className="dn-cmp-row dn-cmp-hd">
              <span>·</span><span>HIDDIFY</span><span>HAPP</span>
            </div>
            <div className="dn-cmp-row"><span>сложность</span><span>средняя</span><span>низкая</span></div>
            <div className="dn-cmp-row"><span>VLESS</span><span>да</span><span>да</span></div>
            <div className="dn-cmp-row"><span>подписка</span><span>да</span><span>да</span></div>
            <div className="dn-cmp-row"><span>профили</span><span>∞</span><span>10</span></div>
            <div className="dn-cmp-row"><span>split-tunnel</span><span>да</span><span>—</span></div>
          </div>
        </Box>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 10) INSTRUCTIONS — Setup steps
// ═════════════════════════════════════════════════════════════════════════════
function ScreenSetup({ go, state }) {
  const os = state.os || 'android';
  const app = state.app || 'hiddify';

  // platform x app step matrix
  const STEPS = {
    android: {
      hiddify: [
        ['Установи Hiddify', 'Открой Google Play и найди «Hiddify». Альтернатива — APK с hiddify.com (только официальный домен).'],
        ['Скопируй подписку', 'Вернись в DarkNode → ПОДПИСКА → вкладка SUB-URL → СКОПИРОВАТЬ SUB.'],
        ['Добавь профиль', 'В Hiddify нажми «+» внизу → «Add from clipboard». Профиль появится в списке.'],
        ['Включи туннель', 'Большая кнопка по центру. Иконка ключа в статус-баре = ты внутри.'],
        ['Проверь IP', 'Загляни на ifconfig.me — должен показаться IP узла STO-01 (Sweden).'],
      ],
      happ: [
        ['Установи Happ', 'Google Play → «Happ». Или прямой APK с happ.su (только официальный домен).'],
        ['Скопируй VLESS-ссылку', 'В DarkNode → ПОДПИСКА → вкладка VLESS-URI → СКОПИРОВАТЬ.'],
        ['Импортируй', 'В Happ нажми «+» → «Из буфера». Профиль DarkNode-STO-01 появится сверху.'],
        ['Подключись', 'Тапни по профилю. Подтверди VPN-разрешение в Android — это одноразово.'],
        ['Готово', 'Зелёная иконка в трее = трафик идёт через DarkNode.'],
      ],
    },
    ios: {
      hiddify: [
        ['Установи Hiddify', 'App Store → «Hiddify Next». Только разработчик «hiddify.com».'],
        ['Скопируй подписку', 'DarkNode → ПОДПИСКА → SUB-URL → СКОПИРОВАТЬ.'],
        ['Импортируй', 'В Hiddify нажми «+» → «Paste from clipboard». Подтверди добавление профиля.'],
        ['Разреши VPN', 'iOS попросит подтвердить добавление VPN-конфигурации. Face ID / пароль.'],
        ['Включи', 'Большая кнопка по центру. В верхней панели появится индикатор VPN.'],
      ],
      happ: [
        ['Установи Happ', 'App Store → «Happ Proxy Utility». Разработчик «Happ Team».'],
        ['Скопируй VLESS', 'DarkNode → ПОДПИСКА → VLESS-URI → СКОПИРОВАТЬ.'],
        ['Импортируй', 'В Happ нажми «+» → «Paste from clipboard».'],
        ['Разреши VPN', 'Подтверди VPN-конфигурацию в iOS-настройках. Face ID / пароль.'],
        ['Включи', 'Тапни по профилю. Иконка VPN в статус-баре = всё работает.'],
      ],
    },
  };

  const steps = STEPS[os][app];
  const appName = app === 'hiddify' ? 'HIDDIFY' : 'HAPP';
  const osName  = os  === 'ios'     ? 'iOS'     : 'ANDROID';

  return (
    <div className="dn-screen">
      <Top left={<BackBtn onClick={() => go('app')} />} right={<MenuDots />} />
      <div className="dn-page">
        <SectionHead num="04" label="SETUP.RUNBOOK" right={`${osName} · ${appName}`} />
        <h2 className="dn-h2">5 шагов<br/>до подключения.</h2>

        <Box title={`// VIDEO · ${appName} on ${osName}`}>
          <VideoPlaceholder label={`${appName.toLowerCase()}_${os}.mp4`} duration="01:24" />
          <div className="dn-vid-cap">
            <span className="dn-dim">// без звука. весь процесс на экране.</span>
            <button className="dn-mini">▶ ПОЛНОЭКРАН</button>
          </div>
        </Box>

        <div className="dn-steps">
          {steps.map((s, i) => (
            <div key={i} className="dn-step">
              <div className="dn-step-num">
                <span className="dn-dim">STEP</span>
                <span className="dn-step-n">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <div className="dn-step-body">
                <div className="dn-step-title">{s[0]}</div>
                <div className="dn-step-text">{s[1]}</div>
              </div>
              <div className="dn-step-ln" />
            </div>
          ))}
        </div>

        <Box title="// TROUBLESHOOT">
          <div className="dn-trouble">
            <TroubleRow code="ERR_TIMEOUT" txt="Проверь, что подписка скопирована полностью, до символа =." />
            <TroubleRow code="ERR_REALITY" txt="Обнови клиент. Hiddify v2.0.5+, Happ v1.7+." />
            <TroubleRow code="ERR_DPI"     txt="Обнови подписку (pull-to-refresh) — sid и pbk REALITY ротируются каждые 24 ч." />
          </div>
        </Box>

        <div className="dn-cta">
          <Btn onClick={() => go('dashboard')}>ГОТОВО — В КАБИНЕТ →</Btn>
          <button className="dn-link" onClick={() => go('app')}>
            <u>попробовать другой клиент</u>
          </button>
        </div>
      </div>
    </div>
  );
}

function TroubleRow({ code, txt }) {
  return (
    <div className="dn-trb">
      <span className="dn-trb-code">{code}</span>
      <span className="dn-trb-txt">{txt}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 11) FORGOT PASSWORD — request reset code
// ═════════════════════════════════════════════════════════════════════════════
function ScreenForgot({ go, state, setState }) {
  const [email, setEmail] = useS(state.email || '');
  const [err, setErr] = useS({});
  const [busy, setBusy] = useS(false);
  const [apiErr, setApiErr] = useS('');

  const submit = async () => {
    const e = {};
    if (!email.includes('@')) e.email = 'неверный формат';
    setErr(e);
    setApiErr('');
    if (Object.keys(e).length) return;
    setBusy(true);
    const res = await window.dnApi.forgotPassword(email.trim());
    setBusy(false);
    if (!res.ok) {
      setApiErr(window.DN_ERROR_LABELS[res.error] || res.error);
      return;
    }
    setState((s) => ({ ...s, email: email.trim() }));
    go('reset');
  };

  return (
    <div className="dn-screen">
      <Top left={<BackBtn onClick={() => go('login')} />} right={<MenuDots />} />
      <div className="dn-page">
        <SectionHead num="—" label="PASSWORD.RESET" right="step 1/2" />
        <h2 className="dn-h2">Сброс<br/>пароля.</h2>
        <p className="dn-p">
          Введи email от аккаунта. Если аккаунт существует и подтверждён,
          пришлём на него шестизначный код.
        </p>
        <div className="dn-form">
          <Field label="EMAIL" value={email} onChange={setEmail} type="email"
                 placeholder="you@example.com" error={err.email} autoFocus />
        </div>
        {apiErr && <div className="dn-api-err">// {apiErr}</div>}
        <div className="dn-cta">
          <Btn onClick={submit} disabled={busy}>
            {busy ? 'ОТПРАВКА...' : 'ПРИСЛАТЬ КОД →'}
          </Btn>
          <button className="dn-link" onClick={() => go('login')}>
            <u>назад ко входу</u>
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 12) RESET PASSWORD — consume code + set new password
// ═════════════════════════════════════════════════════════════════════════════
function ScreenReset({ go, state, setState }) {
  const [code, setCode] = useS(['', '', '', '', '', '']);
  const [pwd, setPwd] = useS('');
  const [pwd2, setPwd2] = useS('');
  const [err, setErr] = useS({});
  const [busy, setBusy] = useS(false);
  const [apiErr, setApiErr] = useS('');
  const refs = useR([]);

  const setDigit = (i, v) => {
    v = v.replace(/[^0-9]/g, '').slice(0, 1);
    setCode((c) => { const n = [...c]; n[i] = v; return n; });
    if (v && refs.current[i + 1]) refs.current[i + 1].focus();
  };
  const filled = code.every(Boolean);

  const submit = async () => {
    const e = {};
    if (!filled) e.code = 'введи код полностью';
    if (pwd.length < 8) e.pwd = 'минимум 8 символов';
    if (pwd !== pwd2) e.pwd2 = 'не совпадает';
    setErr(e);
    setApiErr('');
    if (Object.keys(e).length) return;
    setBusy(true);
    const res = await window.dnApi.resetPassword(state.email, code.join(''), pwd);
    setBusy(false);
    if (!res.ok) {
      setApiErr(window.DN_ERROR_LABELS[res.error] || res.error);
      if (res.error === 'code_invalid' || res.error === 'code_expired') {
        setCode(['', '', '', '', '', '']);
        if (refs.current[0]) refs.current[0].focus();
      }
      return;
    }
    setState((s) => ({ ...s, loggedIn: true }));
    go('dashboard');
  };

  return (
    <div className="dn-screen">
      <Top left={<BackBtn onClick={() => go('forgot')} />} right={<MenuDots />} />
      <div className="dn-page">
        <SectionHead num="—" label="PASSWORD.RESET" right="step 2/2" />
        <h2 className="dn-h2">Введи код<br/>и новый пароль.</h2>
        <p className="dn-p">
          Шестизначный код отправили на<br/>
          <span className="dn-hl">{state.email || 'you@example.com'}</span>.
        </p>

        <div className="dn-code">
          {code.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className="dn-code-cell"
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !d && refs.current[i - 1]) refs.current[i - 1].focus();
              }}
              maxLength={1}
              size={1}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          ))}
        </div>
        {err.code && <div className="dn-api-err">// {err.code}</div>}

        <div className="dn-form">
          <Field label="НОВЫЙ ПАРОЛЬ" value={pwd} onChange={setPwd}
                 type="password" placeholder="••••••••" error={err.pwd} hint="мин. 8" />
          <Field label="ПОВТОР" value={pwd2} onChange={setPwd2}
                 type="password" placeholder="••••••••" error={err.pwd2} />
        </div>

        {apiErr && <div className="dn-api-err">// {apiErr}</div>}

        <div className="dn-cta">
          <Btn onClick={submit} disabled={busy}>
            {busy ? 'СБРОС...' : 'СБРОСИТЬ ПАРОЛЬ →'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── expose ──────────────────────────────────────────────────────────────────
Object.assign(window, {
  ScreenLanding, ScreenRegister, ScreenLogin, ScreenVerify, ScreenPlans,
  ScreenDashboard, ScreenVless, ScreenOS, ScreenApp, ScreenSetup,
  ScreenForgot, ScreenReset,
});
