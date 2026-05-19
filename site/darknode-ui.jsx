// darknode-ui.jsx — primitives for DarkNode VPN
// Tech-noir, monospace, brutalist. All components consume tokens from CSS vars.

const { useState, useEffect, useRef, useMemo } = React;

// ── tiny helpers ──────────────────────────────────────────────────────────────
function cls(...xs) { return xs.filter(Boolean).join(' '); }

// ── blinking caret ────────────────────────────────────────────────────────────
function Caret({ ch = '▊', style = {} }) {
  return <span className="dn-caret" style={style}>{ch}</span>;
}

// ── ASCII divider (full-width dashes) ─────────────────────────────────────────
function Rule({ ch = '─', style = {} }) {
  return (
    <div className="dn-rule" style={style} aria-hidden="true">
      <span>{ch.repeat(80)}</span>
    </div>
  );
}

// ── labeled section header: "01_NODE.STATUS" ──────────────────────────────────
function SectionHead({ num, label, right }) {
  return (
    <div className="dn-sect">
      <div>
        <span className="dn-dim">{num}_</span>
        <span>{label}</span>
      </div>
      {right && <div className="dn-dim">{right}</div>}
    </div>
  );
}

// ── ASCII boxed container ─────────────────────────────────────────────────────
function Box({ title, children, accent = false, mono = true, style = {}, foot }) {
  return (
    <div className={cls('dn-box', accent && 'dn-box-accent')} style={style}>
      {title && (
        <div className="dn-box-hd">
          <span className="dn-box-corner">┌─</span>
          <span className="dn-box-title">{title}</span>
          <span className="dn-box-line" />
        </div>
      )}
      <div className="dn-box-body" style={mono ? undefined : { fontFamily: 'inherit' }}>
        {children}
      </div>
      {foot && <div className="dn-box-foot">{foot}</div>}
    </div>
  );
}

// ── button: solid block, inverts on press ─────────────────────────────────────
function Btn({ children, onClick, variant = 'primary', full = true, disabled, icon, sub }) {
  return (
    <button
      className={cls('dn-btn', `dn-btn-${variant}`, full && 'dn-btn-full', disabled && 'dn-btn-dis')}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span className="dn-btn-inner">
        {icon && <span className="dn-btn-icon">{icon}</span>}
        <span className="dn-btn-label">{children}</span>
        {sub && <span className="dn-btn-sub">{sub}</span>}
      </span>
    </button>
  );
}

// ── form field with monospace label and underline input ──────────────────────
function Field({ label, value, onChange, type = 'text', placeholder, error, hint, autoFocus }) {
  const [focus, setFocus] = useState(false);
  return (
    <label className={cls('dn-field', focus && 'dn-field-focus', error && 'dn-field-err')}>
      <div className="dn-field-lbl">
        <span>&gt; {label}</span>
        {error ? <span className="dn-err">! {error}</span>
              : hint  ? <span className="dn-dim">{hint}</span> : null}
      </div>
      <div className="dn-field-wrap">
        <input
          className="dn-input"
          type={type}
          value={value}
          autoFocus={autoFocus}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder={placeholder}
        />
        {focus && <Caret ch="_" style={{ marginLeft: 2 }} />}
      </div>
    </label>
  );
}

// ── status pill: [ ON ] / [OFF] / [WAIT] ──────────────────────────────────────
function Status({ state = 'on', label }) {
  const map = {
    on:   { txt: 'ACTIVE',  cls: 'dn-st-on'   },
    off:  { txt: 'OFFLINE', cls: 'dn-st-off'  },
    wait: { txt: 'PENDING', cls: 'dn-st-wait' },
    err:  { txt: 'ERROR',   cls: 'dn-st-err'  },
  };
  const s = map[state] || map.on;
  return (
    <span className={cls('dn-status', s.cls)}>
      <span className="dn-status-dot" />
      [{label || s.txt}]
    </span>
  );
}

// ── pseudo-random QR-looking grid (deterministic from string) ─────────────────
function QRGrid({ data, size = 25 }) {
  const cells = useMemo(() => {
    // stable hash → pattern
    let h = 2166136261;
    for (let i = 0; i < data.length; i++) {
      h ^= data.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    const rng = () => {
      h ^= h << 13; h >>>= 0;
      h ^= h >>> 17; h >>>= 0;
      h ^= h << 5;  h >>>= 0;
      return (h % 1000) / 1000;
    };
    const out = [];
    for (let y = 0; y < size; y++) {
      const row = [];
      for (let x = 0; x < size; x++) {
        row.push(rng() > 0.5 ? 1 : 0);
      }
      out.push(row);
    }
    // stamp 3 finder patterns (7x7) at corners
    const finder = (cx, cy) => {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const px = cx + x, py = cy + y;
        if (px >= size || py >= size) continue;
        const edge = x === 0 || x === 6 || y === 0 || y === 6;
        const center = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        out[py][px] = (edge || center) ? 1 : 0;
      }
      // outer quiet ring
      for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
        const px = cx + x, py = cy + y;
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        if (x === -1 || x === 7 || y === -1 || y === 7) out[py][px] = 0;
      }
    };
    finder(0, 0);
    finder(size - 7, 0);
    finder(0, size - 7);
    // alignment box bottom-right
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      const px = size - 9 + x, py = size - 9 + y;
      const edge = x === 0 || x === 4 || y === 0 || y === 4;
      const center = x === 2 && y === 2;
      out[py][px] = (edge || center) ? 1 : 0;
    }
    return out;
  }, [data, size]);

  return (
    <div className="dn-qr" style={{ '--qr-size': size }}>
      {cells.flatMap((row, y) =>
        row.map((v, x) => (
          <div key={`${x}-${y}`} className={v ? 'dn-qr-on' : 'dn-qr-off'} />
        ))
      )}
      <div className="dn-qr-overlay">
        <div className="dn-qr-brand">▲</div>
      </div>
    </div>
  );
}

// ── monospace key-value rows ─────────────────────────────────────────────────
function KV({ k, v, copyable, onCopy }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    if (copyable) {
      try { navigator.clipboard.writeText(v); } catch (_) {}
      setCopied(true);
      onCopy && onCopy();
      setTimeout(() => setCopied(false), 1400);
    }
  };
  return (
    <div className={cls('dn-kv', copyable && 'dn-kv-copy')} onClick={copyable ? handle : undefined}>
      <div className="dn-kv-k">{k}</div>
      <div className="dn-kv-v">{copied ? 'COPIED ✓' : v}</div>
    </div>
  );
}

// ── video placeholder (striped, with play glyph) ─────────────────────────────
function VideoPlaceholder({ label = 'TUTORIAL.MP4', duration = '01:24' }) {
  return (
    <div className="dn-vid">
      <div className="dn-vid-stripes" />
      <div className="dn-vid-tag dn-vid-tag-tl">REC ●</div>
      <div className="dn-vid-tag dn-vid-tag-tr">{duration}</div>
      <div className="dn-vid-play">
        <div className="dn-vid-tri">▶</div>
      </div>
      <div className="dn-vid-tag dn-vid-tag-bl">{label}</div>
      <div className="dn-vid-tag dn-vid-tag-br">SD · NO·AUDIO</div>
      <div className="dn-vid-scan" />
    </div>
  );
}

// ── DarkNode wordmark + glyph ────────────────────────────────────────────────
function Logo({ size = 18, glyphOnly = false }) {
  return (
    <span className="dn-logo" style={{ fontSize: size }}>
      <svg className="dn-logo-glyph" width={size * 1.15} height={size * 1.15} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <rect x="6" y="6" width="12" height="12" fill="currentColor" />
        <rect x="10" y="10" width="4" height="4" fill="var(--dn-bg)" />
      </svg>
      {!glyphOnly && <span className="dn-logo-text">DARKNODE</span>}
    </span>
  );
}

// ── animated terminal lines (used on landing splash) ─────────────────────────
function Boot({ lines, onDone, speed = 38 }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= lines.length) { onDone && onDone(); return; }
    const t = setTimeout(() => setShown((s) => s + 1), speed * (lines[shown]?.length || 4) / 4 + 80);
    return () => clearTimeout(t);
  }, [shown, lines, onDone, speed]);
  return (
    <div className="dn-boot">
      {lines.slice(0, shown).map((l, i) => (
        <div key={i} className="dn-boot-l">{l}</div>
      ))}
      {shown < lines.length && <div className="dn-boot-l">{lines[shown]}<Caret /></div>}
    </div>
  );
}

Object.assign(window, {
  Caret, Rule, SectionHead, Box, Btn, Field, Status, QRGrid, KV, VideoPlaceholder, Logo, Boot,
});
