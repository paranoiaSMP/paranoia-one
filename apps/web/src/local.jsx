import { useEffect, useState } from "react";
import { addDays, ymd } from "./lib";
import { Empty, PageHead } from "./ui";

// Stockage navigateur: pas de backend pour ces modules. shortcut: données par appareil, passer à l'API quand elle existe.
export function useLocalList(id) {
  const key = `paranoia_local_${id}`;
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* stockage indisponible */ } }, [key, items]);
  return [items, setItems];
}

function AddRow({ id, placeholder, onAdd }) {
  const [text, setText] = useState("");
  return (
    <form className="quick" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) { onAdd(t); setText(""); } }}>
      <input id={`${id}-new`} aria-label={placeholder} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="dx-btn primary" type="submit" disabled={!text.trim()}>Ajouter</button>
    </form>
  );
}

const Del = ({ label, onClick }) => <button className="dx-x" type="button" aria-label={`Supprimer ${label}`} onClick={onClick}>×</button>;

/* ---------- Habitudes: 7 derniers jours + série ---------- */
export function HabitsPage({ id }) {
  const [items, setItems] = useLocalList(id);
  const now = new Date();
  const week = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6));
  const t = ymd(now);
  const toggle = (h, day) => setItems(items.map((x) => {
    if (x.id !== h.id) return x;
    const days = x.days ?? [];
    return { ...x, days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] };
  }));
  const streak = (h) => {
    const days = h.days ?? [];
    let d = days.includes(t) ? now : addDays(now, -1), n = 0;
    while (days.includes(ymd(d))) { n++; d = addDays(d, -1); }
    return n;
  };
  const doneToday = items.filter((h) => (h.days ?? []).includes(t)).length;
  return (
    <section className="page-view">
      <PageHead title="Habitudes" sub={items.length ? `${doneToday} sur ${items.length} faites aujourd'hui` : "Une habitude, une case par jour"} />
      <AddRow id={id} placeholder="Nouvelle habitude" onAdd={(x) => setItems([...items, { id: crypto.randomUUID(), t: x, days: [] }])} />
      {items.length === 0 ? <Empty title="Aucune habitude" hint="Ajoute la première, par exemple « Lire 20 minutes »." /> : (
        <ul className="hb">
          <li className="hb-head" aria-hidden="true"><span />{week.map((d) => <span key={ymd(d)} className={ymd(d) === t ? "now" : ""}>{d.toLocaleDateString("fr-FR", { weekday: "narrow" })}</span>)}<span /></li>
          {items.map((h) => (
            <li className="hb-row" key={h.id}>
              <div className="hb-name"><b>{h.t}</b><small>{streak(h) > 0 ? `${streak(h)} j d'affilée` : "Pas de série"}</small></div>
              {week.map((d) => {
                const k = ymd(d), on = (h.days ?? []).includes(k);
                return <button key={k} type="button" className={`hb-d${on ? " on" : ""}${k === t ? " now" : ""}`} aria-pressed={on} aria-label={`${h.t}, ${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}`} onClick={() => toggle(h, k)} />;
              })}
              <Del label={h.t} onClick={() => setItems(items.filter((y) => y.id !== h.id))} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Ressources: liens et notes courtes ---------- */
const isUrl = (s) => /^https?:\/\/\S+$/i.test(s);
const host = (s) => { try { return new URL(s).hostname.replace(/^www\./, ""); } catch { return s; } };

export function ResourcesPage({ id }) {
  const [items, setItems] = useLocalList(id);
  return (
    <section className="page-view">
      <PageHead title="Ressources" sub="Colle un lien ou écris une référence à garder sous la main" />
      <AddRow id={id} placeholder="https://… ou une référence" onAdd={(x) => setItems([{ id: crypto.randomUUID(), t: x }, ...items])} />
      {items.length === 0 ? <Empty title="Rien de rangé" hint="Les liens collés ici s'ouvrent d'un clic." /> : (
        <ul className="rows">
          {items.map((x) => (
            <li className="row-item" key={x.id}>
              <span className="lead" aria-hidden="true">{isUrl(x.t) ? "↗" : "¶"}</span>
              <div>
                {isUrl(x.t) ? <a href={x.t} target="_blank" rel="noreferrer noopener"><b>{host(x.t)}</b></a> : <b>{x.t}</b>}
                {isUrl(x.t) && <small>{x.t}</small>}
              </div>
              <Del label={x.t} onClick={() => setItems(items.filter((y) => y.id !== x.id))} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Liste en lecture seule (équipes, activité) ---------- */
export function ListPage({ title, intro, rows, emptyTitle = "Rien pour le moment" }) {
  return (
    <section className="page-view">
      <PageHead title={title} sub={intro} />
      {rows.length === 0 ? <Empty title={emptyTitle} /> : (
        <ul className="rows">
          {rows.map((r) => (
            <li className="row-item" key={r.key} data-k={r.tag}>
              <span className="lead" aria-hidden="true">{r.lead ?? r.title?.[0]?.toUpperCase()}</span>
              <div><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</div>
              {r.tag && <span className="tag">{r.tag}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
