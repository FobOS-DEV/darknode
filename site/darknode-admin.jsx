// darknode-admin.jsx — Admin screens for DarkNode VPN
// Same tech-noir aesthetic; consumes the same go() / state / setState contract.

const { useState: useAS, useMemo: useAM, useEffect: useAE } = React;

// ─── fake data ───────────────────────────────────────────────────────────────
// Deterministic pseudo-data for 200 users. Re-runs of the page get the same
// numbers, but the array is "live" in-session — admin actions update it.

function buildUsers() {
  const firstParts = ['ivan', 'mila', 'oleg', 'nika', 'pavel', 'sasha', 'leo', 'dasha', 'andrey', 'kris', 'roman', 'yana', 'denis', 'olga', 'misha', 'sveta', 'kostya', 'vera', 'gleb', 'lena', 'arseniy', 'tonya', 'matvey', 'rita', 'foma', 'liza', 'fedor', 'inna', 'stas', 'alya'];
  const domains = ['proton.me', 'gmail.com', 'yandex.ru', 'tutanota.com', 'mail.ru', 'duck.com', 'fastmail.com'];
  const out = [];
  let seed = 0xcafe1234;
  const rng = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed >>>= 0; seed ^= seed << 5; seed >>>= 0; return seed / 0xffffffff; };

  for (let i = 0; i < 200; i++) {
    const fp = firstParts[i % firstParts.length];
    const id = (1000 + i).toString(16);
    const email = `${fp}.${id}@${domains[i % domains.length]}`;
    // distribution: 55% active (paid), 25% trial, 12% expiring soon, 5% expired, 3% banned
    const r = rng();
    let status, days, plan;
    if (r < 0.55)       { status = 'active';   days = Math.floor(rng() * 28) + 3;   plan = rng() < 0.2 ? 'annual' : 'standard'; }
    else if (r < 0.80)  { status = 'trial';    days = Math.floor(rng() * 7) + 1;    plan = 'trial'; }
    else if (r < 0.92)  { status = 'expiring'; days = Math.floor(rng() * 3) + 1;    plan = rng() < 0.5 ? 'standard' : 'trial'; }
    else if (r < 0.97)  { status = 'expired';  days = -Math.floor(rng() * 30) - 1;  plan = 'standard'; }
    else                { status = 'banned';   days = 0;                            plan = 'standard'; }

    const tgb = Math.round(rng() * 80 * 10) / 10;
    out.push({
      id: 'u_' + id,
      email,
      plan,
      status,
      days,                              // remaining (negative = expired)
      created: `2026-${String(1 + (i % 5)).padStart(2,'0')}-${String(1 + (i % 27)).padStart(2,'0')}`,
      lastSeen: rng() < 0.85 ? `${Math.floor(rng()*22)}h ago` : `${Math.floor(rng()*30) + 1}d ago`,
      tgb,
      devices: Math.max(1, Math.floor(rng() * 4)),
      extensions: Math.floor(rng() * 6),
      node: 'STO-01',
    });
  }
  return out;
}

const __SEED_USERS = buildUsers();
const __SEED_LOG = [
  { t: '14:42', who: 'misha.13a8@yandex.ru', kind: 'EXTEND',   tag: '+30d',    actor: 'admin' },
  { t: '14:31', who: 'lena.1389@proton.me',  kind: 'SIGNUP',   tag: 'trial',   actor: 'system' },
  { t: '14:18', who: 'dasha.13b0@gmail.com', kind: 'EXTEND',   tag: '+365d',   actor: 'admin' },
  { t: '13:51', who: 'foma.13b4@duck.com',   kind: 'REROLL',   tag: 'vless',   actor: 'admin' },
  { t: '13:22', who: 'fedor.139c@mail.ru',   kind: 'EXPIRED',  tag: 'auto',    actor: 'system' },
  { t: '12:58', who: 'kris.139e@yandex.ru',  kind: 'BAN',      tag: 'manual',  actor: 'admin' },
  { t: '12:33', who: 'gleb.13b8@gmail.com',  kind: 'EXTEND',   tag: '+30d',    actor: 'admin' },
  { t: '12:11', who: 'andrey.13a1@proton.me',kind: 'TRAFFIC',  tag: '10GB · cap', actor: 'system' },
];

// ─── shared atoms ────────────────────────────────────────────────────────────
function AdminTop({ title, sub, left, right }) {
  return (
    <div className="dn-top">
      <div className="dn-top-row">
        <div className="dn-top-side">{left}</div>
        <div className="dn-top-center"><Logo size={13} glyphOnly /></div>
        <div className="dn-top-side dn-top-side-r">{right || <span className="dn-dim dn-mono-sm">ADMIN</span>}</div>
      </div>
      <div className="dn-top-meta">
        <div className="dn-top-sub">// {sub}</div>
      </div>
    </div>
  );
}

// status pill (compact)
function UserStatus({ status }) {
  const map = {
    active:   { txt: 'ACTIVE',   cls: 'dn-ust-on'   },
    trial:    { txt: 'TRIAL',    cls: 'dn-ust-trial'},
    expiring: { txt: 'EXPIRING', cls: 'dn-ust-warn' },
    expired:  { txt: 'EXPIRED',  cls: 'dn-ust-off'  },
    banned:   { txt: 'BANNED',   cls: 'dn-ust-err'  },
  };
  const s = map[status] || map.active;
  return <span className={`dn-ust ${s.cls}`}>{s.txt}</span>;
}

function planLabel(p) {
  return p === 'annual' ? 'ANNUAL · 1y' : p === 'standard' ? 'STANDARD · 30d' : 'PROBE · 7d';
}

// ── toast ────────────────────────────────────────────────────────────────────
let __toastId = 0;
function useToast() {
  const [toasts, setToasts] = useAS([]);
  const push = (msg, kind = 'ok') => {
    const id = ++__toastId;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400);
  };
  const view = (
    <div className="dn-toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`dn-toast dn-toast-${t.kind}`}>
          <span className="dn-toast-mark">{t.kind === 'ok' ? '[\u2713]' : '[!]'}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
  return [push, view];
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN HOME — overview / metrics
// ═════════════════════════════════════════════════════════════════════════════
function useAdminLoad(state, setState) {
  // Load the real user list + audit log once per admin-session. If the API
  // says we're not an admin we silently fall back to seed data so the design
  // preview keeps working in the tweak panel.
  useAE(() => {
    if (state.adminUsers && state.adminLog) return;
    let alive = true;
    Promise.all([window.dnApi.admin.users(), window.dnApi.admin.log()]).then(([usersRes, logRes]) => {
      if (!alive) return;
      setState((s) => ({
        ...s,
        adminUsers: usersRes.ok ? usersRes.data.users : s.adminUsers || __SEED_USERS,
        adminLog:   logRes.ok ? logRes.data.entries : s.adminLog || __SEED_LOG,
      }));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function ScreenAdminHome({ go, state, setState }) {
  useAdminLoad(state, setState);
  const users = state.adminUsers || __SEED_USERS;
  const log = state.adminLog || __SEED_LOG;
  const stats = useAM(() => {
    const total = users.length;
    const active   = users.filter((u) => u.status === 'active').length;
    const trial    = users.filter((u) => u.status === 'trial').length;
    const expiring = users.filter((u) => u.status === 'expiring').length;
    const banned   = users.filter((u) => u.status === 'banned').length;
    const revenue  = users.filter((u) => u.status === 'active').reduce((s, u) => s + (u.plan === 'annual' ? 999 / 12 : 100), 0);
    const trafficGb = users.reduce((s, u) => s + u.tgb, 0);
    return { total, active, trial, expiring, banned, revenue: Math.round(revenue), trafficGb: Math.round(trafficGb) };
  }, [users]);

  const traffic7d = [62, 58, 71, 64, 69, 78, 82]; // GB
  const max = Math.max(...traffic7d);

  return (
    <div className="dn-screen">
      <AdminTop sub="admin · overview" />
      <div className="dn-page">
        <div className="dn-greet">
          <div className="dn-dim dn-mono-sm">{'>'} session.admin · neshchadin</div>
          <h2 className="dn-h2">Сводка<br/>по сети.</h2>
        </div>

        <div className="dn-mxgrid">
          <Metric k="USERS"    v={stats.total}    sub={`${stats.active} active`} />
          <Metric k="MRR"      v={`${stats.revenue} ₽`} sub="прогноз / мес" />
          <Metric k="TRAFFIC"  v={`${stats.trafficGb} ГБ`} sub="за 30 дн." />
          <Metric k="EXPIRING" v={stats.expiring} sub="≤ 3 дн." accent={stats.expiring > 0} />
        </div>

        <Box title="// TRAFFIC · STO-01 / 7d">
          <div className="dn-spark">
            {traffic7d.map((v, i) => (
              <div key={i} className="dn-spark-col">
                <div className="dn-spark-bar" style={{ height: `${(v / max) * 100}%` }} />
                <div className="dn-spark-lbl">{['П','В','С','Ч','П','С','В'][i]}</div>
              </div>
            ))}
          </div>
          <div className="dn-sub-rows">
            <KV k="uptime"  v="41 д. · 04:12" />
            <KV k="cpu"     v="14% / 4 core" />
            <KV k="latency" v="184 ms (avg)" />
            <KV k="status"  v="HEALTHY" />
          </div>
        </Box>

        <Box title="// FUNNEL · 30d">
          <div className="dn-fun">
            <FunRow lbl="регистрации"      n={48} pct={100} />
            <FunRow lbl="пробник активен"  n={42} pct={88}  />
            <FunRow lbl="продлили вручную" n={19} pct={40}  />
            <FunRow lbl="продлили повторно" n={9}  pct={19}  />
          </div>
        </Box>

        <Box title="// QUEUE · NEEDS.ACTION">
          <UserQueue
            users={users}
            onSelect={(u) => { setState((s) => ({ ...s, adminUserId: u.id })); go('admin_user'); }}
          />
          <div className="dn-qr-actions" style={{ marginTop: 10 }}>
            <button className="dn-mini" onClick={() => go('admin_users')}>ВСЕ ПОЛЬЗОВАТЕЛИ →</button>
          </div>
        </Box>

        <Box title="// LOG · LAST.8">
          <div className="dn-log">
            {log.slice(0, 8).map((e, i) => (
              <div key={i} className="dn-log-row">
                <span className="dn-dim dn-mono-sm">[{(e.t || '').slice(11, 16) || e.t}]</span>
                <span className="dn-log-kind">{(e.action || e.kind || '').replace(/^admin\./, '').replace(/^system\./, '').toUpperCase()}</span>
                <span className="dn-log-who">{e.who}</span>
                <span className="dn-log-tag">{e.tag || ''}</span>
              </div>
            ))}
          </div>
        </Box>
      </div>
    </div>
  );
}

function Metric({ k, v, sub, accent }) {
  return (
    <div className={cls('dn-metric', accent && 'dn-metric-accent')}>
      <div className="dn-metric-k">{k}</div>
      <div className="dn-metric-v">{v}</div>
      <div className="dn-metric-sub">{sub}</div>
    </div>
  );
}

function FunRow({ lbl, n, pct }) {
  return (
    <div className="dn-fun-row">
      <div className="dn-fun-head">
        <span>{lbl}</span>
        <span><span className="dn-hl">{n}</span> <span className="dn-dim">· {pct}%</span></span>
      </div>
      <div className="dn-fun-bar"><div className="dn-fun-fill" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function UserQueue({ users, onSelect }) {
  const needs = users.filter((u) => u.status === 'expiring' || u.status === 'expired').slice(0, 5);
  if (!needs.length) return <div className="dn-dim dn-mono-sm">// очередь пуста. красиво.</div>;
  return (
    <div className="dn-q">
      {needs.map((u) => (
        <button key={u.id} className="dn-q-row" onClick={() => onSelect(u)}>
          <div className="dn-q-mail">{u.email}</div>
          <div className="dn-q-meta">
            <UserStatus status={u.status} />
            <span className="dn-dim">
              {u.days >= 0 ? `${u.days} дн.` : `просрочен ${-u.days} дн.`}
            </span>
          </div>
          <div className="dn-q-arrow">→</div>
        </button>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN USERS — list + search + filters
// ═════════════════════════════════════════════════════════════════════════════
function ScreenAdminUsers({ go, state, setState }) {
  useAdminLoad(state, setState);
  const users = state.adminUsers || __SEED_USERS;
  const [q, setQ] = useAS('');
  const [filter, setFilter] = useAS('expiring'); // all / active / trial / expiring / banned

  const filtered = useAM(() => {
    let xs = users;
    if (filter !== 'all') xs = xs.filter((u) => u.status === filter);
    const qq = q.trim().toLowerCase();
    if (qq) xs = xs.filter((u) => u.email.toLowerCase().includes(qq));
    // ordering: expiring soonest first, else by lastSeen string roughly
    xs = [...xs].sort((a, b) => a.days - b.days);
    return xs;
  }, [users, q, filter]);

  const counts = useAM(() => ({
    all:      users.length,
    active:   users.filter((u) => u.status === 'active').length,
    trial:    users.filter((u) => u.status === 'trial').length,
    expiring: users.filter((u) => u.status === 'expiring').length,
    expired:  users.filter((u) => u.status === 'expired').length,
    banned:   users.filter((u) => u.status === 'banned').length,
  }), [users]);

  const [toast, toastView] = useToast();

  const quickExtend = async (u, days, label) => {
    const res = await window.dnApi.admin.extend(u.id, days);
    if (!res.ok) {
      // Demo mode (not authed / 403) — keep local mutation so tweak-panel
      // preview still feels alive.
      setState((s) => {
        const list = s.adminUsers || __SEED_USERS;
        const updated = list.map((x) => x.id === u.id ? { ...x, days: Math.max(0, x.days) + days, status: 'active', extensions: x.extensions + 1, plan: days >= 300 ? 'annual' : 'standard' } : x);
        return { ...s, adminUsers: updated };
      });
      toast(`${u.email.split('@')[0]} → ${label} · demo`, 'warn');
      return;
    }
    setState((s) => ({
      ...s,
      adminUsers: (s.adminUsers || __SEED_USERS).map((x) => x.id === u.id ? res.data.user : x),
    }));
    toast(`${u.email.split('@')[0]} → ${label}`);
  };

  return (
    <div className="dn-screen">
      <AdminTop
        sub="users · 200"
        left={<button className="dn-back" onClick={() => go('admin_home')}>← HOME</button>}
      />
      <div className="dn-page">
        <SectionHead num="01" label="USER.INDEX" right={`${filtered.length} / ${users.length}`} />

        <div className="dn-search">
          <span className="dn-dim">/</span>
          <input
            className="dn-input"
            placeholder="email или фрагмент"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            spellCheck={false}
          />
          {q && <button className="dn-search-x" onClick={() => setQ('')}>×</button>}
        </div>

        <div className="dn-chips">
          {[
            ['expiring','EXPIRING', counts.expiring],
            ['trial',   'TRIAL',    counts.trial],
            ['active',  'ACTIVE',   counts.active],
            ['expired', 'EXPIRED',  counts.expired],
            ['banned',  'BANNED',   counts.banned],
            ['all',     'ALL',      counts.all],
          ].map(([k, lbl, n]) => (
            <button
              key={k}
              className={cls('dn-chip', filter === k && 'dn-chip-act')}
              onClick={() => setFilter(k)}
            >
              {lbl}<span className="dn-dim"> · {n}</span>
            </button>
          ))}
        </div>

        <div className="dn-ul">
          {filtered.length === 0 && (
            <div className="dn-dim dn-mono-sm" style={{ padding: '24px 0', textAlign: 'center' }}>
              // ничего не найдено
            </div>
          )}
          {filtered.slice(0, 50).map((u) => (
            <UserRow
              key={u.id}
              u={u}
              onOpen={() => { setState((s) => ({ ...s, adminUserId: u.id })); go('admin_user'); }}
              onExtend={(d, lbl) => quickExtend(u, d, lbl)}
            />
          ))}
          {filtered.length > 50 && (
            <div className="dn-dim dn-mono-sm" style={{ padding: '12px 0', textAlign: 'center' }}>
              // показаны 50 из {filtered.length}. уточни запрос.
            </div>
          )}
        </div>
      </div>
      {toastView}
    </div>
  );
}

function UserRow({ u, onOpen, onExtend }) {
  return (
    <div className="dn-urow">
      <button className="dn-urow-main" onClick={onOpen}>
        <div className="dn-urow-mail">{u.email}</div>
        <div className="dn-urow-meta">
          <UserStatus status={u.status} />
          <span className="dn-dim">·</span>
          <span>{planLabel(u.plan)}</span>
          <span className="dn-dim">·</span>
          <span className={u.days < 4 ? 'dn-hl' : ''}>
            {u.days >= 0 ? `${u.days} дн.` : `просрочен ${-u.days} дн.`}
          </span>
        </div>
      </button>
      <div className="dn-urow-acts">
        <button className="dn-quick" onClick={(e) => { e.stopPropagation(); onExtend(30,  '+30 дн.'); }}>+30</button>
        <button className="dn-quick" onClick={(e) => { e.stopPropagation(); onExtend(365, '+365 дн.'); }}>+365</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN USER — single card
// ═════════════════════════════════════════════════════════════════════════════
function ScreenAdminUser({ go, state, setState }) {
  useAdminLoad(state, setState);
  const users = state.adminUsers || __SEED_USERS;
  const u = users.find((x) => x.id === state.adminUserId) || users[0];
  const [toast, toastView] = useToast();
  const [confirmBan, setConfirmBan] = useAS(false);

  const replaceUser = (next) => setState((s) => ({
    ...s,
    adminUsers: (s.adminUsers || __SEED_USERS).map((x) => x.id === u.id ? next : x),
  }));

  const localUpdate = (patch) => setState((s) => {
    const list = s.adminUsers || __SEED_USERS;
    return { ...s, adminUsers: list.map((x) => x.id === u.id ? { ...x, ...patch } : x) };
  });

  const extend = async (days, lbl) => {
    const res = await window.dnApi.admin.extend(u.id, days);
    if (!res.ok) {
      localUpdate({
        days: Math.max(0, u.days) + days,
        status: 'active',
        extensions: u.extensions + 1,
        plan: days >= 300 ? 'annual' : 'standard',
      });
      toast(`${lbl} · demo`, 'warn');
      return;
    }
    replaceUser(res.data.user);
    toast(`${lbl}`);
  };

  const reroll = async () => {
    const res = await window.dnApi.admin.rotateUuid(u.id);
    if (!res.ok) {
      toast('перевыпуск (demo)', 'warn');
      return;
    }
    replaceUser(res.data.user);
    toast('VLESS-ключ перевыпущен');
  };

  const ban = async () => {
    setConfirmBan(false);
    const res = await window.dnApi.admin.ban(u.id);
    if (!res.ok) {
      localUpdate({ status: 'banned', days: 0 });
      toast('бан (demo)', 'warn');
      return;
    }
    replaceUser(res.data.user);
    toast('пользователь забанен', 'warn');
  };

  const unban = async () => {
    const res = await window.dnApi.admin.unban(u.id);
    if (!res.ok) {
      localUpdate({ status: 'active', days: 30 });
      toast('бан снят (demo)', 'warn');
      return;
    }
    replaceUser(res.data.user);
    toast('бан снят');
  };

  // pseudo history
  const history = useAM(() => {
    const out = [{ t: u.created, kind: 'SIGNUP', tag: 'trial', actor: 'system' }];
    for (let i = 0; i < u.extensions; i++) {
      out.push({ t: `2026-0${(i % 5) + 2}-${10 + i}`, kind: 'EXTEND', tag: i === u.extensions - 1 ? (u.plan === 'annual' ? '+365d' : '+30d') : '+30d', actor: 'admin' });
    }
    if (u.status === 'banned') out.push({ t: '2026-05-12', kind: 'BAN', tag: 'manual', actor: 'admin' });
    return out.reverse();
  }, [u]);

  return (
    <div className="dn-screen">
      <AdminTop
        sub={`user · ${u.id}`}
        left={<button className="dn-back" onClick={() => go('admin_users')}>← USERS</button>}
      />
      <div className="dn-page">
        <SectionHead num="—" label="USER.CARD" right={u.id} />

        <div className="dn-uhead">
          <h2 className="dn-h2-sm dn-uhead-mail">{u.email}</h2>
          <div className="dn-uhead-meta">
            <UserStatus status={u.status} />
            <span className="dn-dim">·</span>
            <span>{planLabel(u.plan)}</span>
            <span className="dn-dim">·</span>
            <span className={u.days < 4 ? 'dn-hl' : ''}>
              {u.days >= 0 ? `${u.days} дн.` : `просрочен ${-u.days} дн.`}
            </span>
          </div>
        </div>

        <Box title="// EXTEND · 1 TAP">
          <div className="dn-uextend">
            <button className="dn-ext-big dn-ext-30"  onClick={() => extend(30,  '+30 дн.')}>
              <span className="dn-ext-lbl">+30</span>
              <span className="dn-ext-sub">месяц</span>
            </button>
            <button className="dn-ext-big dn-ext-365" onClick={() => extend(365, '+365 дн.')}>
              <span className="dn-ext-lbl">+365</span>
              <span className="dn-ext-sub">год</span>
            </button>
            <button className="dn-ext-big dn-ext-7"   onClick={() => extend(7,   '+7 дн.')}>
              <span className="dn-ext-lbl">+7</span>
              <span className="dn-ext-sub">бонус</span>
            </button>
          </div>
          <div className="dn-dim dn-mono-sm" style={{ marginTop: 10 }}>
            // email с подтверждением и новым сроком отправляется автоматически
          </div>
        </Box>

        <Box title="// PROFILE">
          <div className="dn-sub-rows">
            <KV k="email"       v={u.email} copyable />
            <KV k="user_id"     v={u.id} copyable />
            <KV k="регистрация" v={u.created} />
            <KV k="последний вход" v={u.lastSeen} />
            <KV k="устройств"   v={`${u.devices} / 5`} />
            <KV k="трафик 30d"  v={`${u.tgb} ГБ`} />
            <KV k="продлений"   v={`${u.extensions}`} />
            <KV k="узел"        v={u.node + ' / se'} />
          </div>
        </Box>

        <Box title="// VLESS.KEY">
          <div className="dn-uri" style={{ maxHeight: 80 }}>
            vless://{u.id.replace('u_','')}…@sto-01.darknode.space:443?type=tcp&security=reality&sni=cdn.cloudflare.com#DarkNode-{u.id}
          </div>
          <div className="dn-qr-actions" style={{ marginTop: 8 }}>
            <button className="dn-mini" onClick={reroll}>↻ ПЕРЕВЫПУСТИТЬ КЛЮЧ</button>
          </div>
        </Box>

        <Box title="// HISTORY">
          <div className="dn-log">
            {history.map((e, i) => (
              <div key={i} className="dn-log-row">
                <span className="dn-dim dn-mono-sm">[{e.t}]</span>
                <span className="dn-log-kind">{e.kind}</span>
                <span className="dn-log-tag">{e.tag}</span>
                <span className="dn-dim dn-mono-sm">{e.actor}</span>
              </div>
            ))}
          </div>
        </Box>

        <Box title="// DANGER">
          {u.status === 'banned' ? (
            <button className="dn-danger" onClick={unban}>СНЯТЬ БАН</button>
          ) : confirmBan ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="dn-danger" onClick={ban}>ПОДТВЕРДИТЬ БАН</button>
              <button className="dn-mini" onClick={() => setConfirmBan(false)}>отмена</button>
            </div>
          ) : (
            <button className="dn-danger-out" onClick={() => setConfirmBan(true)}>ЗАБЛОКИРОВАТЬ</button>
          )}
        </Box>
      </div>
      {toastView}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN LOG — full activity stream
// ═════════════════════════════════════════════════════════════════════════════
function ScreenAdminLog({ go, state, setState }) {
  useAE(() => {
    let alive = true;
    window.dnApi.admin.log().then((res) => {
      if (!alive) return;
      setState((s) => ({ ...s, adminLog: res.ok ? res.data.entries : (s.adminLog || __SEED_LOG) }));
    });
    return () => { alive = false; };
  }, []);

  const long = state.adminLog || __SEED_LOG;

  return (
    <div className="dn-screen">
      <AdminTop sub="event · log" left={<button className="dn-back" onClick={() => go('admin_home')}>← HOME</button>} />
      <div className="dn-page">
        <SectionHead num="—" label="EVENT.LOG" right={`${long.length} · today`} />
        <Box>
          <div className="dn-log">
            {long.map((e, i) => (
              <div key={i} className="dn-log-row">
                <span className="dn-dim dn-mono-sm">[{(e.t || '').slice(0, 16).replace('T', ' ') || e.t}]</span>
                <span className="dn-log-kind">{(e.action || e.kind || '').replace(/^admin\./, '').replace(/^system\./, '').toUpperCase()}</span>
                <span className="dn-log-who">{e.who}</span>
                <span className="dn-log-tag">{e.tag || ''}</span>
                <span className="dn-dim dn-mono-sm">{e.actor}</span>
              </div>
            ))}
          </div>
        </Box>
      </div>
    </div>
  );
}

Object.assign(window, {
  ScreenAdminHome, ScreenAdminUsers, ScreenAdminUser, ScreenAdminLog,
});
