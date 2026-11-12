import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const read = (id) => { try { return JSON.parse(localStorage.getItem(`paranoia_local_${id}`)) ?? []; } catch { return []; } };
const strip = (s) => String(s ?? "").replace(/^(#{1,3} |[-*] |> |\[[ x]\] )/gm, "");

// Recherche globale: tout est filtré côté navigateur dans les données déjà chargées. shortcut: 50 notes/tâches max (limite des listes de l'API), passer à une route /search si ça grandit.
export function SearchPalette({ open, initial = "", onClose, nav, mode, notes, tasks, events }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef(null);
  const list = useRef(null);

  useEffect(() => { if (open) { setQ(initial); setAt(0); input.current?.focus(); } }, [open]);

  const all = useMemo(() => {
    if (!open) return [];
    const local = (kind, page, ids) => ids.flatMap((id) => read(`${id}_${mode}`).map((x) => ({ kind, to: page, title: x.t, sub: x.d ?? "" })));
    return [
      ...nav.flatMap(([, links]) => links).map(([id, label]) => ({ kind: "Page", to: id, title: label, sub: "" })),
      ...notes.map((n) => ({ kind: "Note", to: "notes", title: n.title || "Sans titre", sub: strip(n.content).replace(/\s+/g, " ").slice(0, 120), body: strip(n.content) })),
      ...tasks.map((t) => ({ kind: "Tâche", to: "tasks", title: t.title, sub: t.description ?? "" })),
      ...events.map((e) => ({ kind: "Événement", to: "calendar", title: e.title, sub: e.date })),
      ...local("Projet", "projects", ["projects"]),
      ...local("Objectif", "goals", ["goals"]),
      ...local("Habitude", "habits", ["habits"]),
      ...local("Ressource", "resources", ["resources"]),
    ].filter((x) => x.title);
  }, [open, nav, mode, notes, tasks, events]);

  const hits = useMemo(() => {
    const k = norm(q).trim();
    if (!k) return all.filter((x) => x.kind === "Page");
    return all
      .map((x) => {
        const t = norm(x.title);
        const s = t.startsWith(k) ? 3 : t.includes(k) ? 2 : norm(x.sub).includes(k) || norm(x.body).includes(k) ? 1 : 0;
        return { ...x, s };
      })
      .filter((x) => x.s).sort((a, b) => b.s - a.s).slice(0, 12);
  }, [all, q]);

  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [at]);
  if (!open) return null;

  const go = (h) => { if (h) { window.location.hash = h.to; onClose(); } };
  const key = (e) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") go(hits[at]);
  };

  return (
    <div className="pal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Recherche" onKeyDown={key}>
        <input ref={input} role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={hits[at] ? `pal-${at}` : undefined}
          aria-label="Rechercher" placeholder="Rechercher une tâche, une note, un projet" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul id="pal-list" role="listbox" ref={list}>
          {hits.map((h, i) => (
            <li key={h.kind + i + h.title} id={`pal-${i}`} role="option" aria-selected={i === at} data-k={h.kind}
              onMouseMove={() => setAt(i)} onClick={() => go(h)}>
              <span className="pal-ico" aria-hidden="true">{h.kind === "Page" ? <Icon id={h.to} size={16} /> : null}</span>
              <span className="pal-t"><b>{h.title}</b>{h.sub && <small>{h.sub}</small>}</span>
              <span className="pal-kind">{h.kind}</span>
            </li>
          ))}
          {hits.length === 0 && <li className="pal-none">Aucun résultat pour « {q.trim()} »</li>}
        </ul>
        <div className="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span><span><kbd>↵</kbd> ouvrir</span><span><kbd>Échap</kbd> fermer</span></div>
      </div>
    </div>
  );
}
