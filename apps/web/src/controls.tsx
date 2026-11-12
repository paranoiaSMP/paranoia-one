// Custom form controls (the native select / date / color / number popups can't be styled).
// Each one mirrors its value in a hidden input, so plain <form> + FormData + reset() keep working,
// and also supports controlled use (value + onChange).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { addDays, today, ymd } from "./lib";

function useVal(value: string | undefined, def: string) {
  const [v, setV] = useState(def);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const f = ref.current?.form;
    if (!f) return;
    const r = () => setV(def);
    f.addEventListener("reset", r);
    return () => f.removeEventListener("reset", r);
  }, [def]);
  return [value ?? v, setV, ref] as const;
}

function Pop({ label, text, muted, disabled, cls = "", panelCls = "", haspopup, swatch, fixed = true, children }: {
  label?: string; text: string; muted?: boolean; disabled?: boolean; cls?: string; panelCls?: string;
  haspopup: "listbox" | "dialog"; swatch?: string; fixed?: boolean; children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); btn.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    const scroll = (e: Event) => {
      if (panel.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scroll, { capture: true, passive: true });
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  useLayoutEffect(() => {
    const p = panel.current, b = btn.current;
    if (!open || !p) return;
    if (fixed && b) {
      const br = b.getBoundingClientRect();
      const ph = p.offsetHeight, pw = p.offsetWidth;
      const below = br.bottom + 6 + ph <= innerHeight - 8;
      p.style.position = "fixed";
      p.style.zIndex = "100";
      p.style.top = below ? `${br.bottom + 6}px` : `${Math.max(8, br.top - 6 - ph)}px`;
      const targetLeft = br.left + pw <= innerWidth - 8 ? br.left : Math.max(8, br.right - pw);
      p.style.left = `${Math.max(8, Math.min(targetLeft, innerWidth - pw - 8))}px`;
      p.style.visibility = "visible";
      return;
    }
    if (p.getBoundingClientRect().right > innerWidth - 8) { p.style.left = "auto"; p.style.right = "0"; }
  }, [open, fixed]);
  return (
    <div ref={root} className={`pw ${cls}`} onBlur={(e) => { if (open && e.relatedTarget && !root.current?.contains(e.relatedTarget as Node) && !panel.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button ref={btn} type="button" className={`fld ${muted ? "ph" : ""}`} aria-label={label} aria-haspopup={haspopup} aria-expanded={open}
        disabled={disabled} onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}>
        {swatch !== undefined && <i className="dot" style={{ background: swatch || "transparent" }} />}
        <span>{text}</span>
      </button>
      {open && <div ref={panel} className={`pop ${fixed ? "pop-fixed " : ""}${panelCls}`}>{children(close)}</div>}
    </div>
  );
}

/* Select */
export type Opt = [value: string, label: string];
export function Select({ options, value, defaultValue, onChange, name, label, disabled, cls }: {
  options: Opt[]; value?: string; defaultValue?: string; onChange?: (v: string) => void; name?: string; label: string; disabled?: boolean; cls?: string;
}) {
  const [v, setV, ref] = useVal(value, defaultValue ?? options[0]?.[0] ?? "");
  const cur = options.find(([k]) => k === v) ?? options[0];
  return (
    <>
      <input ref={ref} type="hidden" name={name} value={cur?.[0] ?? ""} />
      <Pop label={label} text={cur?.[1] ?? ""} disabled={disabled} cls={cls} haspopup="listbox" panelCls="list">
        {(close) => <List options={options} v={cur?.[0]} onPick={(k) => { setV(k); onChange?.(k); close(); }} />}
      </Pop>
    </>
  );
}
function List({ options, v, onPick }: { options: Opt[]; v?: string; onPick: (k: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { (ref.current?.querySelector<HTMLElement>("[aria-selected=true]") ?? (ref.current?.firstElementChild as HTMLElement | null))?.focus(); }, []);
  const move = (e: React.KeyboardEvent) => {
    const items = [...ref.current!.children] as HTMLElement[], i = items.indexOf(document.activeElement as HTMLElement);
    const to = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
    if (to === null) return;
    e.preventDefault(); items[(to + items.length) % items.length]?.focus();
  };
  return (
    <div ref={ref} role="listbox" onKeyDown={move}>
      {options.map(([k, l]) => <button type="button" role="option" key={k} aria-selected={k === v} className="opt" onClick={() => onPick(k)}>{l}</button>)}
    </div>
  );
}

/* Date */
const parse = (v: string) => new Date(v + "T00:00");
const short = (v: string) => parse(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function Calendar({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const [foc, setFoc] = useState(value || today());
  const grid = useRef<HTMLDivElement>(null), moved = useRef(true);
  const view = parse(foc), first = new Date(view.getFullYear(), view.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  useEffect(() => {
    if (moved.current) grid.current?.querySelector<HTMLElement>(`[data-d="${foc}"]`)?.focus();
    moved.current = false;
  }, [foc]);
  const go = (n: number) => setFoc(ymd(new Date(view.getFullYear(), view.getMonth() + n, 1)));
  const key = (e: React.KeyboardEvent) => {
    const d = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
    if (d !== undefined) { e.preventDefault(); moved.current = true; setFoc(ymd(addDays(view, d))); }
    else if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); moved.current = true; setFoc(ymd(new Date(view.getFullYear(), view.getMonth() + (e.key === "PageUp" ? -1 : 1), view.getDate()))); }
  };
  return (
    <div className="calp" role="dialog" aria-label="Choisir une date">
      <div className="calp-head">
        <button type="button" className="dx-iconbtn" aria-label="Mois précédent" onClick={() => go(-1)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13l-5-5 5-5"/></svg>
        </button>
        <b style={{ textTransform: "capitalize" }} aria-live="polite">{view.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</b>
        <button type="button" className="dx-iconbtn" aria-label="Mois suivant" onClick={() => go(1)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3l5 5-5 5"/></svg>
        </button>
      </div>
      <div ref={grid} className="mini" onKeyDown={key}>
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <small key={i} aria-hidden>{d}</small>)}
        {Array.from({ length: 42 }, (_, i) => {
          const d = addDays(start, i), k = ymd(d);
          return <button type="button" key={k} data-d={k} tabIndex={k === foc ? 0 : -1} aria-pressed={k === value}
            aria-label={d.toLocaleDateString("fr-FR", { dateStyle: "full" })}
            className={`dy ${d.getMonth() !== view.getMonth() ? "out" : ""} ${k === today() ? "now" : ""} ${k === value ? "sel" : ""}`}
            onClick={() => onPick(k)}>{d.getDate()}</button>;
        })}
      </div>
      <div className="calp-foot">
        <button type="button" className="dx-btn ghost" onClick={() => onPick(today())}>Aujourd'hui</button>
        <button type="button" className="dx-btn ghost" onClick={() => onPick("")}>Effacer</button>
      </div>
    </div>
  );
}
export function DatePick({ value, defaultValue = "", onChange, name, label, placeholder = "Date", cls, fixed = true }: {
  value?: string; defaultValue?: string; onChange?: (v: string) => void; name?: string; label: string; placeholder?: string; cls?: string; fixed?: boolean;
}) {
  const [v, setV, ref] = useVal(value, defaultValue);
  return (
    <>
      <input ref={ref} type="hidden" name={name} value={v} />
      <Pop label={label} text={v ? short(v) : placeholder} muted={!v} cls={cls} haspopup="dialog" fixed={fixed}>
        {(close) => <Calendar value={v} onPick={(d) => { setV(d); onChange?.(d); close(); }} />}
      </Pop>
    </>
  );
}

/* Time Picker */
export function TimePick({
  value,
  defaultValue = "09:00",
  onChange,
  name,
  label,
  placeholder = "00:00",
  cls,
  fixed = true,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  name?: string;
  label: string;
  placeholder?: string;
  cls?: string;
  fixed?: boolean;
}) {
  const [v, setV, ref] = useVal(value, defaultValue);
  const cur = v || defaultValue;
  const [hStr = "09", mStr = "00"] = cur.split(":");
  const hNum = parseInt(hStr, 10) || 0;
  const mNum = parseInt(mStr, 10) || 0;

  const setTime = (newH: number, newM: number) => {
    const timeStr = `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
    setV(timeStr);
    onChange?.(timeStr);
  };

  return (
    <>
      <input ref={ref} type="hidden" name={name} value={v} />
      <Pop label={label} text={v || placeholder} muted={!v} cls={cls} haspopup="dialog" fixed={fixed}>
        {(close) => (
          <TimePicker
            hour={hNum}
            minute={mNum}
            onChange={(h, m) => setTime(h, m)}
            onDone={close}
          />
        )}
      </Pop>
    </>
  );
}

function TimePicker({
  hour,
  minute,
  onChange,
  onDone,
}: {
  hour: number;
  minute: number;
  onChange: (h: number, m: number) => void;
  onDone: () => void;
}) {
  const hoursListRef = useRef<HTMLDivElement>(null);
  const minsListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hActive = hoursListRef.current?.querySelector<HTMLElement>("[aria-selected='true']");
    if (hActive && hoursListRef.current) {
      hoursListRef.current.scrollTop = hActive.offsetTop - hoursListRef.current.clientHeight / 2 + hActive.clientHeight / 2;
    }
    const mActive = minsListRef.current?.querySelector<HTMLElement>("[aria-selected='true']");
    if (mActive && minsListRef.current) {
      minsListRef.current.scrollTop = mActive.offsetTop - minsListRef.current.clientHeight / 2 + mActive.clientHeight / 2;
    }
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const setNow = () => {
    const now = new Date();
    const h = now.getHours();
    const m = Math.round(now.getMinutes() / 5) * 5 % 60;
    onChange(h, m);
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="timep" role="dialog" aria-label="Choisir une heure">
      <div className="timep-head">
        <div className="timep-val">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 4.5v3.5l2.5 1.5" />
          </svg>
          <b>{pad(hour)}</b>:<b>{pad(minute)}</b>
        </div>
        <button type="button" className="timep-now" onClick={setNow}>Maintenant</button>
      </div>

      <div className="timep-cols">
        <div className="timep-col">
          <span className="timep-col-title">Heures</span>
          <div ref={hoursListRef} className="timep-list" role="listbox" aria-label="Heures">
            {hours.map((h) => (
              <button
                type="button"
                role="option"
                key={h}
                aria-selected={h === hour}
                className="timep-item"
                onClick={() => onChange(h, minute)}
              >
                {pad(h)}
              </button>
            ))}
          </div>
        </div>

        <div className="timep-col">
          <span className="timep-col-title">Minutes</span>
          <div ref={minsListRef} className="timep-list" role="listbox" aria-label="Minutes">
            {minutes.map((m) => (
              <button
                type="button"
                role="option"
                key={m}
                aria-selected={m === minute}
                className="timep-item"
                onClick={() => onChange(hour, m)}
              >
                {pad(m)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="timep-foot">
        <div className="timep-quick" aria-label="Raccourcis">
          {[0, 15, 30, 45].map((qm) => (
            <button
              type="button"
              key={qm}
              className={minute === qm ? "is-active" : ""}
              onClick={() => onChange(hour, qm)}
            >
              :{pad(qm)}
            </button>
          ))}
        </div>
        <button type="button" className="timep-done" onClick={onDone}>Valider</button>
      </div>
    </div>
  );
}

/** value = "YYYY-MM-DDTHH:mm" or "" (same shape as toInput()). */
export function DateTimePick({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  const [d = "", t = ""] = value.split("T");
  return (
    <span className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
      <DatePick label={`${label}, date`} placeholder={placeholder ?? label} value={d} onChange={(x) => onChange(x ? `${x}T${t || "09:00"}` : "")} />
      <TimePick label={`${label}, heure`} value={t || "09:00"} onChange={(x) => onChange(`${d || today()}T${x}`)} />
    </span>
  );
}

/* Color */
export const SWATCHES: Opt[] = [["#ff5a36", "Corail"], ["#ff9f1a", "Ambre"], ["#f2c94c", "Jaune"], ["#3ecf8e", "Vert"], ["#2dd4bf", "Turquoise"],
  ["#4da3ff", "Bleu"], ["#7c6cf0", "Violet"], ["#c76bd6", "Orchidée"], ["#ff6b9a", "Rose"], ["#8a8a85", "Gris"]];
const HEX = /^#[0-9a-f]{6}$/i;
export function Swatches({ value, onPick, none }: { value: string; onPick: (v: string) => void; none?: boolean }) {
  return (
    <div className="sws" role="group" aria-label="Couleurs">
      {none && <button type="button" className="sw none" aria-label="Aucune couleur" aria-pressed={!value} onClick={() => onPick("")} />}
      {SWATCHES.map(([c, n]) => <button type="button" key={c} className="sw" style={{ background: c }} aria-label={n} title={n} aria-pressed={c === value} onClick={() => onPick(c)} />)}
    </div>
  );
}
export function ColorPick({ value, defaultValue = "", onChange, name, label, none }: {
  value?: string; defaultValue?: string; onChange?: (v: string) => void; name?: string; label: string; none?: boolean;
}) {
  const [v, setV, ref] = useVal(value, defaultValue);
  const [hex, setHex] = useState(v);
  const set = (c: string) => { setV(c); setHex(c); onChange?.(c); };
  const nm = SWATCHES.find(([c]) => c === v)?.[1] ?? v.toUpperCase();
  return (
    <>
      <input ref={ref} type="hidden" name={name} value={v} />
      <Pop label={label} text={v ? nm : "Aucune"} swatch={v} haspopup="dialog">
        {(close) => (
          <div className="calp" role="dialog" aria-label={label}>
            <Swatches value={v} none={none} onPick={(c) => { set(c); close(); }} />
            <input aria-label="Code hexadécimal" placeholder="#RRGGBB" value={hex} maxLength={7}
              onChange={(e) => { setHex(e.target.value); if (HEX.test(e.target.value)) { setV(e.target.value); onChange?.(e.target.value); } }} />
          </div>)}
      </Pop>
    </>
  );
}

/* Number stepper */
export function Stepper({ value, defaultValue = 1, min = 1, max = 999, onChange, name, label, unit, disabled }: {
  value?: number; defaultValue?: number; min?: number; max?: number; onChange?: (n: number) => void; name?: string; label: string; unit?: string; disabled?: boolean;
}) {
  const [v, setV, ref] = useVal(value === undefined ? undefined : String(value), String(defaultValue));
  const n = Number(v), set = (x: number) => { const c = Math.min(max, Math.max(min, x)); setV(String(c)); onChange?.(c); };
  return (
    <div role="group" aria-label={label} className="step">
      <input ref={ref} type="hidden" name={name} value={n} />
      <button type="button" className="btn ghost" aria-label="Moins" disabled={disabled || n <= min} onClick={() => set(n - 1)}>−</button>
      <output aria-live="polite">{n}{unit ? ` ${unit}` : ""}</output>
      <button type="button" className="btn ghost" aria-label="Plus" disabled={disabled || n >= max} onClick={() => set(n + 1)}>+</button>
    </div>
  );
}
