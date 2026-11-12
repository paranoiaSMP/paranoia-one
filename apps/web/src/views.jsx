import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { BlockEditor } from "./editor";
import { Chevron, Icon } from "./icons";
import { DatePick, Select, TimePick } from "./controls";
import { addDays, today, ymd } from "./lib";
import { useLocalList } from "./local";
import { Empty, PageHead, PRIO } from "./ui";
import { SloshSlider } from "./blocks/SloshSlider";
import { TimeScrubber } from "./blocks/TimeScrubber";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (d, o) => new Intl.DateTimeFormat("fr-FR", o).format(d);
const authed = (token, json = true) => ({ ...(json && { "Content-Type": "application/json" }), Authorization: "Bearer " + token });

export async function request(api, token, method, path, body) {
  const r = await fetch(`${api}/api/v1${path}`, { method, headers: authed(token, body !== undefined), body: body === undefined ? undefined : JSON.stringify(body) });
  const p = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(p?.error?.message ?? "Action impossible."), { code: p?.error?.code });
  return p;
}

/* Remplace le profil complet côté serveur; `current` fournit les champs non modifiés. */
export function saveProfile(api, token, current, patch) {
  const body = { display_name: current?.display_name ?? null, avatar: current?.avatar ?? null, ...patch };
  return request(api, token, "PUT", "/me/profile", body).then(() => body);
}

const FR_ERR = { invalid_credentials: "Mot de passe incorrect.", conflict: "Cette adresse est déjà utilisée.", invalid_input: "Valeur invalide.", forbidden: "Le compte dev garde son adresse (DEV_ADMIN_EMAIL)." };
const frError = (x) => FR_ERR[x.code] ?? x.message;

/* Photo carrée 160 px en JPEG: reste sous 20 Ko, donc stockable telle quelle en base. */
async function resizeAvatar(file) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = Object.assign(document.createElement("canvas"), { width: 160, height: 160 });
  c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 160, 160);
  return c.toDataURL("image/jpeg", 0.85);
}

/* ---------- Mini-calendrier ---------- */
export function CalendarPanel({ onDateSelect, selectedDate }) {
  const [month, setMonth] = useState(() => selectedDate ?? new Date());
  useEffect(() => { if (selectedDate) setMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)); }, [selectedDate]);
  const y = month.getFullYear(), m = month.getMonth();
  const days = useMemo(() => {
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    return [...Array(offset).fill(null), ...Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => i + 1)];
  }, [y, m]);
  const label = cap(fmt(month, { month: "long", year: "numeric" }));
  const now = new Date();
  const same = (d, ref) => ref && d === ref.getDate() && m === ref.getMonth() && y === ref.getFullYear();
  const shift = (n) => setMonth(new Date(y, m + n, 1));
  return (
    <section className="dx-card mini-cal" aria-label="Calendrier">
      <div className="dx-ch">
        <h2>{label}</h2>
        <div className="dx-row">
          <button className="dx-iconbtn" type="button" onClick={() => shift(-1)} aria-label="Mois précédent"><Chevron dir="left" /></button>
          <button className="dx-iconbtn" type="button" onClick={() => shift(1)} aria-label="Mois suivant"><Chevron /></button>
        </div>
      </div>
      <div className="dx-cal">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <span className="w" key={i}>{d}</span>)}
        {days.map((d, i) => d ? (
          <button className={`d${same(d, now) ? " today" : ""}${same(d, selectedDate) ? " selected" : ""}`} type="button" key={i}
            aria-label={`${d} ${label}`} aria-pressed={same(d, selectedDate)} onClick={() => onDateSelect?.(new Date(y, m, d))}>{d}</button>
        ) : <span className="d empty-day" key={i} aria-hidden="true" />)}
      </div>
    </section>
  );
}

/* ---------- Tâches ---------- */
export const PRIORITIES = [["low", "Basse"], ["normal", "Normale"], ["high", "Haute"]];
export const prio = (p) => PRIO[p] ?? (p === "medium" ? PRIO.normal : [p ?? "—", 0]);

function TaskRow({ task, onToggle, onDelete }) {
  const done = task.status === "done";
  const [label, level] = prio(task.priority);
  return (
    <li className={`task${done ? " is-done" : ""}`}>
      <button className="chk" type="button" aria-pressed={done} aria-label={`${task.title}: marquer comme ${done ? "à faire" : "terminée"}`} onClick={() => onToggle(task)} />
      <div><b>{task.title}</b>{task.description && <small>{task.description}</small>}</div>
      {task.due_date && <time>{fmt(new Date(task.due_date), { day: "numeric", month: "short" })}</time>}
      <span className={`dx-prio p${level}`}>{label}</span>
      {onDelete && <button className="dx-x" type="button" aria-label={`Supprimer ${task.title}`} onClick={() => onDelete(task)}>×</button>}
    </li>
  );
}

export const toggleTask = (api, token, t) => patchTask(api, token, t, { status: t.status === "done" ? "todo" : "done" });

export const NEXT_PRIO = { low: "normal", normal: "high", medium: "high", high: "low" };
export const patchTask = (api, token, t, p) => request(api, token, "PUT", `/tasks/${t.id}`, { title: t.title, description: t.description, status: t.status, priority: t.priority, due_date: t.due_date, assignee_id: t.assignee_id ?? null, blocked_by: t.blocked_by ?? null, recurrence: t.recurrence ?? "none", ...p });

/* Ligne de base de données: le titre, l'échéance et la priorité se modifient sur place. */
/* ---------- Équipes ---------- */
const ROLES = [["member", "Membre"], ["admin", "Admin"], ["viewer", "Lecteur"]];
const ROLE_LABEL = { owner: "Propriétaire", admin: "Admin", member: "Membre", viewer: "Lecteur" };

function TeamCard({ w, active, onOpen, onInvited, token, api }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const canInvite = (w.role === "owner" || w.role === "admin") && w.id !== "local-account";
  const send = async (e) => {
    e.preventDefault();
    try {
      setError("");
      const inv = await request(api, token, "POST", `/workspaces/${w.id}/invitations`, { email: email.trim(), role });
      onInvited({ ...inv, workspace: w.name });
      setEmail(""); setOpen(false);
    } catch (x) { setError(x.message); }
  };
  return (
    <li className={`tm${active ? " is-active" : ""}`}>
      <div className="tm-top">
        <span className="lead" aria-hidden="true">{w.name[0]?.toUpperCase()}</span>
        <div><b>{w.name}</b><small>{active ? "Espace actif" : "Espace de travail"}</small></div>
        <span className="tag">{ROLE_LABEL[w.role] ?? w.role}</span>
      </div>
      <div className="tm-act">
        <button className="dx-btn" type="button" disabled={active} onClick={onOpen}>{active ? "Ouvert" : "Ouvrir"}</button>
        {canInvite && <button className="dx-btn" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Inviter</button>}
      </div>
      {open && (
        <form className="tm-inv" onSubmit={send}>
          <input type="email" aria-label={`Email à inviter dans ${w.name}`} placeholder="email@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <Select label="Rôle" options={ROLES} value={role} onChange={setRole} />
          <button className="dx-btn primary" type="submit" disabled={!email.includes("@")}>Envoyer</button>
        </form>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </li>
  );
}

export function TeamsPage({ workspaces, activeWorkspace, onSelect, token, api, onRefresh }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  // shortcut: l'API n'a pas de liste d'invitations, on garde celles envoyées pendant cette session.
  const [sent, setSent] = useState([]);
  const create = async (e) => {
    e.preventDefault();
    try { setError(""); const w = await request(api, token, "POST", "/workspaces", { name: name.trim() }); setName(""); onRefresh(); if (w?.id) onSelect(w); } catch (x) { setError(x.message); }
  };
  return (
    <section className="page-view">
      <PageHead title="Équipes" sub={workspaces.length === 1 ? "1 espace de travail" : `${workspaces.length} espaces de travail`} />
      <form className="quick" onSubmit={create}>
        <input aria-label="Nom du nouvel espace" placeholder="Nom du nouvel espace" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="dx-btn primary" type="submit" disabled={!name.trim()}>Créer l'espace</button>
      </form>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {workspaces.length === 0 ? <Empty title="Aucun espace" hint="Crée le premier ci-dessus." /> : (
        <ul className="tm-grid">
          {workspaces.map((w) => <TeamCard key={w.id} w={w} active={w.id === activeWorkspace?.id} onOpen={() => onSelect(w)} onInvited={(i) => setSent([i, ...sent])} token={token} api={api} />)}
        </ul>
      )}
      {sent.length > 0 && (
        <>
          <h2 className="sub-h">Invitations envoyées <small>{sent.length}</small></h2>
          <ul className="rows">
            {sent.map((i) => (
              <li className="row-item" key={i.id}>
                <span className="lead" aria-hidden="true">{i.email[0]?.toUpperCase()}</span>
                <div><b>{i.email}</b><small>{i.workspace}, {ROLE_LABEL[i.role] ?? i.role}{i.expires_at ? `, expire le ${fmt(new Date(i.expires_at), { day: "numeric", month: "short" })}` : ""}</small></div>
                <span className="tag">{i.status === "pending" ? "En attente" : i.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ---------- Vue d'ensemble ---------- */
export function OverviewPage({ notes, tasks, events, token, onRefresh, api, name }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const key = ymd(now);
  const todays = events.filter((e) => e.date === key).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  const open = tasks.filter((t) => t.status !== "done");
  const toggle = async (t) => { try { await toggleTask(api, token, t); onRefresh(); } catch { /* l'état reste inchangé */ } };
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const add = async (e) => {
    e.preventDefault();
    try { setError(""); await request(api, token, "POST", "/tasks", { title: title.trim(), priority: "normal", description: "", status: "todo", due_date: null }); setTitle(""); onRefresh(); } catch (x) { setError(x.message); }
  };
  const late = open.filter((t) => t.due_date && t.due_date < key).length;
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const next = todays.find((e) => String(e.end_time || e.start_time) >= hhmm);
  const finished = tasks.length - open.length;
  const [flog] = useLocalList("focus_log");
  const fmin = flog.filter((l) => l.day === key).reduce((n, l) => n + l.min, 0);
  return (
    <section className="page-view home-view">
      <header className="home-heading">
        <div><p className="home-date">{cap(fmt(now, { weekday: "long", day: "numeric", month: "long" }))}</p><h1>Bonjour {name}, il est <time dateTime={hhmm}>{hhmm}</time></h1><p>Retrouvez vos priorités et donnez une direction à votre journée.</p></div>
        <a className="dx-btn" href="#focus"><Icon id="focus" /> Commencer une session</a>
      </header>
      <nav className="home-summary" aria-label="Résumé de la journée">
        <a href="#tasks"><Icon id="tasks" /><span>Tâches ouvertes</span><b>{open.length}</b></a>
        <a href="#tasks"><Icon id="activity" /><span>En retard</span><b>{late}</b></a>
        <a href="#calendar"><Icon id="calendar" /><span>Événements du jour</span><b>{todays.length}</b></a>
        <a href="#focus"><Icon id="focus" /><span>Minutes de focus</span><b>{fmin}</b></a>
      </nav>
      <div className="home-layout">
        <div className="home-work">
          <section className="home-section" aria-label="Vos priorités">
            <div className="section-heading"><h2>Vos priorités <span>{open.length}</span></h2><a href="#tasks">Toutes les tâches <span aria-hidden="true">↗</span></a></div>
            <form className="home-compose" onSubmit={add}><span aria-hidden="true">+</span><input aria-label="Nouvelle tâche" placeholder="Ajouter une tâche à votre journée…" value={title} onChange={(e) => setTitle(e.target.value)} /><button className="dx-btn" type="submit" disabled={!title.trim()}>Créer</button></form>
            {error && <p className="inline-error" role="alert">{error}</p>}
            {open.length ? <ul className="tasks flat">{open.slice(0, 6).map((t) => <TaskRow key={t.id} task={t} onToggle={toggle} />)}</ul> : <div className="home-clear"><span className="home-clear-icon"><Icon id="tasks" size={24} /></span><h3>De la place pour l’essentiel.</h3><p>Ajoutez votre prochaine tâche juste au-dessus.</p></div>}
            <div className="home-section-foot">{plural(finished, "tâche terminée", "tâches terminées")}<a href="#tasks">Ouvrir la liste →</a></div>
          </section>
          <section className="home-section" aria-label="Notes récentes">
            <div className="section-heading"><h2>Notes récentes</h2><a href="#notes">Ouvrir les notes ↗</a></div>
            {notes.length ? <div className="home-note-list">{notes.slice(0, 3).map((n) => <a href="#notes" key={n.id}><Icon id={n.title?.match(/^\[icon:([a-z0-9_-]+)\]\s*/i)?.[1] || "notes"} size={18} /><div><b>{(n.title || "").replace(/^\[icon:[a-z0-9_-]+\]\s*/i, "").replace(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*/u, "") || "Sans titre"}</b><p>{n.content || "Note sans contenu"}</p></div><span aria-hidden="true">↗</span></a>)}</div> : <a className="home-note-prompt" href="#notes"><Icon id="notes" size={22} /><span><b>Une idée à garder ?</b><small>Ouvrez votre carnet et créez votre première note.</small></span><span aria-hidden="true">→</span></a>}
          </section>
        </div>
        <aside className="home-agenda">
          <div className="section-heading"><h2>Aujourd’hui</h2><a href="#calendar" aria-label="Ouvrir le calendrier"><Icon id="calendar" /></a></div>
          <div className="home-day"><b>{now.getDate()}</b><div>{cap(fmt(now, { weekday: "long" }))}<span>{cap(fmt(now, { month: "long", year: "numeric" }))}</span></div></div>
          {todays.length ? <ul className="agenda">{todays.map((e) => <li key={e.id} className={e === next ? "is-next" : ""}><time>{e.start_time}</time><b>{e.title}</b></li>)}</ul> : <div className="agenda-free"><span className="agenda-line" /><p>Votre agenda est libre.</p><small>Réservez du temps pour ce qui compte.</small><a className="dx-btn" href="#calendar">Planifier un événement</a></div>}
          <div className="home-focus"><Icon id="focus" size={20} /><h3>Un moment de concentration</h3><p>25 minutes pour avancer sur une seule chose.</p><a href="#focus">Ouvrir Focus <span aria-hidden="true">→</span></a></div>
        </aside>
      </div>
    </section>
  );
}

/* ---------- Notes: pages + éditeur par blocs façon Notion ---------- */
const PAGE_ICONS = [
  { id: "notes", label: "Note" },
  { id: "page", label: "Document" },
  { id: "bulb", label: "Idée" },
  { id: "target", label: "Objectif" },
  { id: "tasks", label: "Tâches" },
  { id: "projects", label: "Projet" },
  { id: "focus", label: "Focus" },
  { id: "star", label: "Étoile" },
  { id: "pin", label: "Épinglé" },
  { id: "bolt", label: "Éclair" },
  { id: "rocket", label: "Lancement" },
  { id: "code", label: "Code" },
  { id: "quote", label: "Citation" },
  { id: "sparkle", label: "Important" },
  { id: "resources", label: "Ressource" },
  { id: "activity", label: "Activité" },
  { id: "calendar", label: "Calendrier" },
  { id: "overview", label: "Général" },
];

export function NotesPage({ notes, token, onRefresh, api }) {
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const note = sel ? notes.find((n) => n.id === sel) ?? null : notes[0] ?? null;
  const fromNote = (n) => (n ? { title: n.title, content: n.content ?? "" } : { title: "", content: "" });
  const [draft, setDraft] = useState(() => fromNote(note));
  const [shownId, setShownId] = useState(note?.id);
  // Le brouillon doit suivre la note affichée dès ce rendu: l'éditeur lit son contenu une seule fois.
  if (shownId !== note?.id) { setShownId(note?.id); setDraft(fromNote(note)); setMsg(""); setIconPickerOpen(false); }
  const dirty = !!note && (draft.title !== note.title || draft.content !== (note.content ?? ""));
  const live = useRef({});
  live.current = { note, draft, dirty };
  const save = async () => {
    const { note: n, draft: d, dirty: dt } = live.current;
    if (!n || !dt) return;
    try { setSaving(true); setMsg(""); await request(api, token, "PUT", `/notes/${n.id}`, d); onRefresh(); } catch (e) { setMsg(e.message); } finally { setSaving(false); }
  };
  useEffect(() => { if (!dirty) return undefined; const t = setTimeout(save, 900); return () => clearTimeout(t); }, [draft, note?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (live.current.dirty) save(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const off = (e) => {
      if (!e.target.closest(".nt-icon-picker") && !e.target.closest(".nt-icon-btn")) {
        setIconPickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, []);

  const pick = async (id) => { if (id !== note?.id) { await save(); setSel(id); } };
  const create = async () => {
    try {
      await save();
      const p = await request(api, token, "POST", "/notes", { title: "Sans titre", content: "" });
      const id = p?.id ?? p?.note?.id;
      if (id) setSel(id);
      onRefresh();
    } catch (e) { setMsg(e.message); }
  };

  const iconMatch = draft.title?.match(/^\[icon:([a-z0-9_-]+)\]\s*/i);
  const currentIcon = iconMatch ? iconMatch[1] : null;
  const cleanTitle = (draft.title || "")
    .replace(/^\[icon:[a-z0-9_-]+\]\s*/i, "")
    .replace(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*/u, "");

  const duplicate = async () => {
    try {
      await save();
      const base = cleanTitle || "Note";
      const nextTitle = iconMatch ? `[icon:${iconMatch[1]}] ${base} (copie)` : `${base} (copie)`;
      const p = await request(api, token, "POST", "/notes", { title: nextTitle, content: draft.content || "" });
      const id = p?.id ?? p?.note?.id;
      if (id) setSel(id);
      onRefresh();
    } catch (e) { setMsg(e.message); }
  };
  const remove = async () => {
    if (!window.confirm("Supprimer cette note ?")) return;
    try { await request(api, token, "DELETE", `/notes/${note.id}`); setSel(null); setDraft({ title: "", content: "" }); onRefresh(); } catch (e) { setMsg(e.message); }
  };
  const copyMarkdown = () => {
    const md = `# ${cleanTitle || "Note"}\n\n${draft.content}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(md);
    }
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 1800);
  };
  const exportMarkdown = () => {
    const md = `# ${cleanTitle || "Note"}\n\n${draft.content}`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(cleanTitle || "note").replace(/[\/\\:*?"<>|]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setPageIcon = (iconId) => {
    if (!iconId) {
      setDraft({ ...draft, title: cleanTitle.trim() });
    } else {
      setDraft({ ...draft, title: `[icon:${iconId}] ${cleanTitle.trim()}` });
    }
    setIconPickerOpen(false);
  };

  const words = (draft.content || "").trim().split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.ceil(words / 200));

  const shown = notes.filter((n) => `${n.title} ${n.content ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="page-view">
      <PageHead title="Notes" sub="Un espace pour vos idées et vos documents" />
      <div className="nt">
        <aside className="nt-list" aria-label="Pages">
          <input type="search" aria-label="Rechercher une note" placeholder="Rechercher une note…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="nt-new" onClick={create}><span aria-hidden="true">+</span> Nouvelle note</button>
          <div className="nt-items">
            {shown.length === 0 && <p className="dx-empty">Aucune note trouvée</p>}
            {shown.map((n) => {
              const m = n.title?.match(/^\[icon:([a-z0-9_-]+)\]\s*/i);
              const nIcon = m ? m[1] : "notes";
              const nTitle = (n.title || "")
                .replace(/^\[icon:[a-z0-9_-]+\]\s*/i, "")
                .replace(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*/u, "") || "Sans titre";
              return (
                <button type="button" key={n.id} className="nt-item" aria-current={note?.id === n.id ? "true" : undefined} onClick={() => pick(n.id)}>
                  <span className="nt-item-icon" aria-hidden="true"><Icon id={nIcon} size={14} /></span>
                  <b>{nTitle}</b>
                </button>
              );
            })}
          </div>
        </aside>
        <article className="nt-edit">
          {note ? (
            <>
              <div className="nt-bar">
                <div className="nt-bar-left">
                  <span role="status" className="nt-save-status">{msg || (saving ? "Enregistrement…" : dirty ? "Modifié" : "Enregistré")}</span>
                  <span className="nt-stats">{words} {words > 1 ? "mots" : "mot"} · ~{readTime} min</span>
                </div>
                <div className="nt-bar-actions">
                  <button
                    className="dx-btn ghost"
                    type="button"
                    title={currentIcon ? "Modifier ou retirer l'icône" : "Ajouter une icône à la note"}
                    onClick={() => {
                      if (!currentIcon) {
                        setDraft({ ...draft, title: `[icon:page] ${cleanTitle.trim()}` });
                        setIconPickerOpen(true);
                      } else {
                        setIconPickerOpen(!iconPickerOpen);
                      }
                    }}
                  >
                    <Icon id={currentIcon || "page"} size={13} />
                    <span>{currentIcon ? "Icône" : "+ Icône"}</span>
                  </button>
                  <button className="dx-btn ghost" type="button" title="Copier tout au format Markdown" onClick={copyMarkdown}>
                    <Icon id={copiedMd ? "check" : "copy"} size={13} />
                    <span>{copiedMd ? "Copié !" : "Copier"}</span>
                  </button>
                  <button className="dx-btn ghost" type="button" title="Télécharger en fichier .md" onClick={exportMarkdown}>
                    <Icon id="download" size={13} />
                    <span>Exporter</span>
                  </button>
                  <button className="dx-btn ghost" type="button" title="Dupliquer cette note" onClick={duplicate}>
                    <Icon id="duplicate" size={13} />
                    <span>Dupliquer</span>
                  </button>
                  <button className="dx-btn ghost nt-delete-btn" type="button" title="Supprimer la note" onClick={remove}>
                    <Icon id="trash" size={13} />
                  </button>
                </div>
              </div>
              <div className="nt-page">
                {/* En-tête de note Notion épuré */}
                <div className="nt-title-row">
                  {currentIcon && (
                    <div className="nt-icon-wrapper">
                      <button
                        type="button"
                        className="nt-icon-btn"
                        title="Modifier ou retirer l'icône"
                        aria-label="Modifier ou retirer l'icône"
                        onClick={() => setIconPickerOpen(!iconPickerOpen)}
                      >
                        <div className="nt-icon-badge">
                          <Icon id={currentIcon} size={22} />
                        </div>
                      </button>
                    </div>
                  )}
                  {iconPickerOpen && (
                    <div className="pop nt-icon-picker" role="menu">
                      <div className="nt-icon-picker-head">
                        <span className="nt-icon-picker-title">Choisir une icône</span>
                        <div className="nt-icon-picker-actions">
                          <button
                            type="button"
                            className="nt-icon-random-btn"
                            title="Choisir une icône au hasard"
                            onClick={() => setPageIcon(PAGE_ICONS[Math.floor(Math.random() * PAGE_ICONS.length)].id)}
                          >
                            <Icon id="dice" size={12} />
                            <span>Aléatoire</span>
                          </button>
                          <button
                            type="button"
                            className="nt-icon-random-btn nt-icon-remove-btn"
                            title="Retirer l'icône"
                            onClick={() => setPageIcon(null)}
                          >
                            <Icon id="trash" size={12} />
                            <span>Retirer</span>
                          </button>
                        </div>
                      </div>
                      <div className="nt-icon-grid">
                        {PAGE_ICONS.map((it) => (
                          <button
                            type="button"
                            key={it.id}
                            className={`nt-icon-opt ${currentIcon === it.id ? "is-selected" : ""}`}
                            title={it.label}
                            onClick={() => setPageIcon(it.id)}
                          >
                            <Icon id={it.id} size={18} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <input
                    className="nt-title"
                    aria-label="Titre de la note"
                    placeholder="Sans titre"
                    value={cleanTitle}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const prefix = iconMatch ? `[icon:${iconMatch[1]}] ` : "";
                      setDraft({ ...draft, title: prefix ? `${prefix}${raw}` : raw });
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.querySelector(".bk-t")?.focus(); } }}
                  />
                </div>
                <BlockEditor key={note.id} value={draft.content} onChange={(content) => setDraft((d) => ({ ...d, content }))} />
              </div>
            </>
          ) : notes.length === 0 ? (
            <div className="nt-empty-state">
              <Empty title="Aucune note" hint="Créez votre première note pour commencer à écrire vos idées." />
              <button type="button" className="dx-btn primary" onClick={create}>+ Nouvelle note</button>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}

/* ---------- Calendrier: semaine ---------- */
const HH = 52, FIRST = 0, LAST = 24;
const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };

// Place les événements qui se chevauchent côte à côte. shortcut: première colonne libre, pas d'optimisation de largeur.
function layout(list) {
  const evs = list.map((e) => {
    const s = Math.max(toMin(e.start_time), FIRST * 60);
    let end = e.end_time ? toMin(e.end_time) : s + 60;
    if (end <= s) end = s + 60;
    return { e, s, end: Math.min(end, LAST * 60) };
  }).sort((a, b) => a.s - b.s);
  const out = [];
  let cluster = [], until = 0;
  const flush = () => { const n = Math.max(...cluster.map((c) => c.lane)) + 1; cluster.forEach((c) => out.push({ ...c, n })); cluster = []; };
  for (const ev of evs) {
    if (cluster.length && ev.s >= until) flush();
    const used = cluster.filter((c) => c.end > ev.s).map((c) => c.lane);
    let lane = 0; while (used.includes(lane)) lane++;
    until = cluster.length ? Math.max(until, ev.end) : ev.end;
    cluster.push({ ...ev, lane });
  }
  if (cluster.length) flush();
  return out;
}

const WEEK = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const monOf = (d) => addDays(d, -((d.getDay() + 6) % 7));

/* Jour ou semaine. Un clic sur un créneau vide appelle onSlot(date, "HH:MM") (arrondi au quart d'heure). */
export function WeekGrid({ events, date, onDate, onSlot, onEvent, days: count = 7 }) {
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 7 * HH; }, []);
  const days = count === 1 ? [date] : Array.from({ length: 7 }, (_, i) => addDays(monOf(date), i));
  const hours = Array.from({ length: LAST - FIRST }, (_, i) => FIRST + i);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const todayKey = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMin - FIRST * 60) / 60) * HH;
  const slot = (e, d) => {
    if (e.target !== e.currentTarget) return;
    const q = Math.min(95, Math.floor(((e.nativeEvent.offsetY / HH) * 60 + FIRST * 60) / 15));
    onSlot?.(d, `${String(Math.floor(q / 4)).padStart(2, "0")}:${String((q % 4) * 15).padStart(2, "0")}`);
  };
  return (
    <section className="wk" aria-label={count === 1 ? "Jour" : "Semaine"}>
      <div className="wk-scroll" ref={scrollRef}>
        <div className="wk-grid" style={{ "--hh": `${HH}px`, "--n": days.length }}>
          <div className="wk-zone">{new Intl.DateTimeFormat("fr-FR", { timeZoneName: "shortOffset" }).formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value}</div>
          {days.map((d) => (
            <button type="button" className={`wk-day${ymd(d) === todayKey ? " today" : ""}${ymd(d) === ymd(date) ? " sel" : ""}`} key={ymd(d)} onClick={() => onDate(d)} aria-label={fmt(d, { weekday: "long", day: "numeric", month: "long" })}>
              <span>{fmt(d, { weekday: "short" }).replace(".", "")}</span><b>{d.getDate()}</b>
            </button>
          ))}
          <div className="wk-hours" style={{ height: HH * hours.length }}>
            {hours.map((h) => <span key={h}>{String(h).padStart(2, "0")}:00</span>)}
          </div>
          {days.map((d) => (
            <div className={`wk-col${ymd(d) === todayKey ? " today" : ""}`} key={ymd(d)} style={{ height: HH * hours.length }} onClick={(e) => slot(e, d)}>
              {ymd(d) === todayKey && nowTop > 0 && nowTop < HH * hours.length && <i className="wk-now" style={{ top: nowTop }} aria-hidden="true" />}
              {layout(events.filter((e) => e.date === ymd(d))).map(({ e, s, end, lane, n }) => {
                const h = Math.max(26, ((end - s) / 60) * HH - 2);
                return (
                  <button type="button" onClick={() => onEvent?.(e)} className={`wk-ev${h < 44 ? " short" : ""}${ymd(d) === todayKey && nowMin >= s && nowMin < end ? " live" : ""}`} key={e.id} title={`${e.title} ${e.start_time}`}
                    style={{ top: ((s - FIRST * 60) / 60) * HH, height: h, left: `calc(${(lane / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}>
                    <b>{e.title}</b><span>{e.start_time}{e.end_time ? `–${e.end_time}` : ""}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Le mois garde uniquement ses semaines utiles; la sélection alimente le programme. */
const MAX_PILLS = 3;
export function MonthGrid({ events, date, onDay, onNew }) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = monOf(first), todayKey = ymd(new Date());
  const offset = (first.getDay() + 6) % 7;
  const count = Math.ceil((offset + new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()) / 7) * 7;
  const cells = Array.from({ length: count }, (_, i) => addDays(start, i));
  return (
    <section className="mo" aria-label="Mois">
      {WEEK.map((w) => <span className="mo-w" key={w}>{w}</span>)}
      {cells.map((d) => {
        const list = events.filter((e) => e.date === ymd(d)).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
        return (
          <div className={`mo-d${d.getMonth() !== date.getMonth() ? " out" : ""}${ymd(d) === todayKey ? " today" : ""}${ymd(d) === ymd(date) ? " selected" : ""}`} key={ymd(d)} onClick={(e) => { if (e.target === e.currentTarget) onDay(d); }}>
            <div className="mo-datebar"><button type="button" className="mo-n" onClick={() => onDay(d)} aria-pressed={ymd(d) === ymd(date)} aria-current={ymd(d) === todayKey ? "date" : undefined} aria-label={`${fmt(d, { weekday: "long", day: "numeric", month: "long" })}, ${list.length} événement${list.length > 1 ? "s" : ""}`}>{d.getDate()}</button><button className="mo-add" type="button" aria-label={`Ajouter un événement le ${fmt(d, { day: "numeric", month: "long" })}`} onClick={() => onNew(d)}>+</button></div>
            {list.length > 0 && <span className="mo-indicator" aria-hidden="true" />}
            {list.slice(0, MAX_PILLS).map((e) => <button type="button" className="mo-ev" key={e.id} title={`${e.start_time} ${e.title}`} onClick={() => onDay(d)}><i>{e.start_time}</i><span>{e.title}</span></button>)}
            {list.length > MAX_PILLS && <button type="button" className="mo-more" onClick={() => onDay(d)}>+{list.length - MAX_PILLS} autres</button>}
          </div>
        );
      })}
    </section>
  );
}

const TIME_OPTS = Array.from({ length: 96 }, (_, i) => { const t = `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`; return [t, t]; });

export function CalendarPage({ events, token, onRefresh, api }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [view, setView] = useState(() => window.matchMedia("(max-width: 760px)").matches ? "day" : "week");
  const [query, setQuery] = useState("");
  const [calendarVisible, setCalendarVisible] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const composerRef = useRef(null);
  useEffect(() => {
    const dialog = composerRef.current;
    if (isAdding && !dialog.open) { dialog.showModal(); dialog.querySelector("#event-title")?.focus(); }
    else if (!isAdding && dialog.open) dialog.close();
  }, [isAdding]);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [error, setError] = useState("");
  const visibleEvents = calendarVisible ? events.filter((e) => `${e.title} ${e.description ?? ""}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr"))) : [];
  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const dayEvents = visibleEvents.filter((e) => e.date === ymd(selectedDate)).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  const pick = (d) => { setSelectedDate(d); setEventDate(ymd(d)); setSelectedEventId(null); };
  const go = (n) => pick(view === "month" ? new Date(selectedDate.getFullYear(), selectedDate.getMonth() + n, 1) : addDays(selectedDate, n * (view === "week" ? 7 : 1)));
  const openNew = (d, t = "09:00") => {
    const end = toMin(t) / 15 + 4;
    setError(""); pick(d); setStartTime(t); setEndTime(end >= 96 ? "" : `${String(Math.floor(end / 4)).padStart(2, "0")}:${String((end % 4) * 15).padStart(2, "0")}`); setIsAdding(true);
  };
  const monday = ymd(monOf(selectedDate)), sunday = ymd(addDays(monOf(selectedDate), 6));
  const inView = visibleEvents.filter((e) => (view === "day" ? e.date === ymd(selectedDate) : view === "week" ? e.date >= monday && e.date <= sunday : String(e.date).startsWith(ymd(selectedDate).slice(0, 7)))).length;
  const scope = { day: "ce jour", week: "cette semaine", month: "ce mois" }[view];
  const changeDate = (v) => { setEventDate(v); const [y, m, d] = v.split("-").map(Number); if (y && m && d) setSelectedDate(new Date(y, m - 1, d)); };
  async function createEvent(e) {
    e.preventDefault();
    setError("");
    if (saving) return;
    if (!title.trim()) return setError("Donnez un titre à votre événement.");
    if (!eventDate) return setError("Choisissez une date.");
    if (!startTime) return setError("Choisissez une heure de début.");
    if (endTime && endTime <= startTime) return setError("L’heure de fin doit être après l’heure de début.");
    setSaving(true);
    try {
      await request(api, token, "POST", "/events", { title: title.trim(), date: eventDate, start_time: startTime, end_time: endTime || null, description: description.trim() });
      setTitle(""); setDescription(""); setIsAdding(false); onRefresh();
    } catch (err) { setError(err.message === "Failed to fetch" ? "Connexion indisponible. Votre brouillon est conservé, vous pouvez réessayer." : err.message); } finally { setSaving(false); }
  }
  return (
    <section className="page-view notion-calendar calendar-workspace" aria-label="Calendrier">
      <header className="calendar-toolbar">
        <div className="calendar-period"><h1 aria-live="polite">{cap(fmt(selectedDate, { month: "long", year: "numeric" }))}</h1><span>{inView} {inView > 1 ? "événements" : "événement"} {scope}</span></div>
        <div className="calendar-controls">
          <select aria-label="Affichage du calendrier" value={view} onChange={(event) => setView(event.target.value)}><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option></select>
          <button className="dx-btn" type="button" onClick={() => pick(new Date())}>Aujourd’hui</button>
          <div className="calendar-arrows"><button className="dx-iconbtn" type="button" aria-label="Période précédente" onClick={() => go(-1)}><Chevron dir="left" /></button><button className="dx-iconbtn" type="button" aria-label="Période suivante" onClick={() => go(1)}><Chevron /></button></div>
          <button className="dx-btn primary" type="button" onClick={() => isAdding ? setIsAdding(false) : openNew(selectedDate)}>{isAdding ? "Fermer" : "+ Événement"}</button>
        </div>
      </header>
      <dialog ref={composerRef} className="event-composer" aria-labelledby="event-composer-heading" onCancel={(event) => { event.preventDefault(); if (!saving) setIsAdding(false); }}>
        <form onSubmit={createEvent} aria-busy={saving}>
          <header className="event-composer-header"><h2 id="event-composer-heading">Nouvel événement</h2><button className="dx-iconbtn" type="button" aria-label="Fermer la création d’événement" disabled={saving} onClick={() => setIsAdding(false)}>×</button></header>
          <div className="event-composer-body">
            <label className="event-title-label" htmlFor="event-title">Titre</label>
            <input className="event-title-input" id="event-title" placeholder="Ajouter un titre" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus disabled={saving} />
            <fieldset className="event-properties" disabled={saving}>
              <legend>Date et horaires</legend>
              <div className="event-property"><Icon id="calendar" /><span>Date</span><DatePick label="Date de l’événement" value={eventDate} onChange={(d) => { if (d) changeDate(d); }} /></div>
              <div className="event-time-row"><Icon id="focus" /><div className="event-time-col"><span>Début</span><TimePick label="Heure de début" value={startTime} onChange={setStartTime} /></div><span className="event-time-arrow" aria-hidden="true">→</span><div className="event-time-col"><span>Fin</span><TimePick label="Heure de fin" value={endTime} onChange={setEndTime} placeholder="Aucune" /></div></div>
              <p className="event-duration">{endTime && endTime > startTime ? `${Math.floor((toMin(endTime) - toMin(startTime)) / 60) ? `${Math.floor((toMin(endTime) - toMin(startTime)) / 60)} h ` : ""}${(toMin(endTime) - toMin(startTime)) % 60 ? `${(toMin(endTime) - toMin(startTime)) % 60} min` : ""}` : "Heure de fin facultative"}</p>
              <p className="event-timezone">Heure locale · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
            </fieldset>
            <div className="event-description"><label htmlFor="event-description">Description</label><textarea id="event-description" placeholder="Ajoutez les détails, un lieu ou un lien…" rows={6} value={description} onChange={(event) => setDescription(event.target.value)} disabled={saving} /></div>
            <div className="event-calendar-label"><span className="calendar-source-dot" />Personnel</div>
            {error && <p className="event-save-error" role="alert">{error}</p>}
          </div>
          <footer className="event-composer-footer"><button className="dx-btn" type="button" disabled={saving} onClick={() => setIsAdding(false)}>Fermer</button><button className="dx-btn primary" type="submit" disabled={saving}>{saving ? "Création…" : "Créer l’événement"}</button></footer>
        </form>
      </dialog>
      <div className="calendar-desk">
        <aside className="calendar-rail" aria-label="Navigation du calendrier">
          <CalendarPanel selectedDate={selectedDate} onDateSelect={pick} />
          <div className="calendar-source"><h2>Mes calendriers</h2><label><input type="checkbox" checked={calendarVisible} onChange={(e) => setCalendarVisible(e.target.checked)} /><span className="calendar-source-dot" />Personnel</label><p>Vos rendez-vous et événements.</p></div>
          <p className="calendar-help">Cliquez sur un créneau pour ajouter un événement.</p>
        </aside>
        <div className="calendar-canvas">
          {view === "month" ? <MonthGrid events={visibleEvents} date={selectedDate} onDay={pick} onNew={openNew} /> : <WeekGrid events={visibleEvents} date={selectedDate} onDate={pick} onSlot={openNew} days={view === "day" ? 1 : 7} onEvent={(event) => { pick(new Date(`${event.date}T12:00:00`)); setSelectedEventId(event.id); }} />}
        </div>
        <aside className="calendar-inspector" aria-label="Programme du jour sélectionné">
          <input className="calendar-search" type="search" aria-label="Rechercher parmi les événements" placeholder="Rechercher un événement…" value={query} onChange={(event) => setQuery(event.target.value)} />
          {selectedEvent ? <section className="calendar-event-detail"><button className="dx-btn ghost" type="button" onClick={() => setSelectedEventId(null)}>← Programme du jour</button><span className="calendar-agenda-label">Événement</span><h2>{selectedEvent.title}</h2><p>{cap(fmt(selectedDate, { weekday: "long", day: "numeric", month: "long" }))}</p><time>{selectedEvent.start_time}{selectedEvent.end_time ? ` – ${selectedEvent.end_time}` : ""}</time>{selectedEvent.description && <p>{selectedEvent.description}</p>}</section> : <section className="calendar-day-panel"><span className="calendar-agenda-label">Votre programme</span><h2>{cap(fmt(selectedDate, { weekday: "long", day: "numeric", month: "long" }))}</h2><div className="calendar-day-events">{dayEvents.length ? dayEvents.map((event) => <button type="button" key={event.id} onClick={() => setSelectedEventId(event.id)}><time>{event.start_time}{event.end_time ? ` – ${event.end_time}` : ""}</time><b>{event.title}</b></button>) : <p className="calendar-day-empty">{query ? "Aucun événement ne correspond à votre recherche ce jour-là." : calendarVisible ? "Aucun événement prévu. Gardez du temps pour ce qui compte." : "Le calendrier Personnel est masqué."}</p>}</div><button className="dx-btn ghost" type="button" onClick={() => openNew(selectedDate)}>+ Ajouter un événement</button></section>}
        </aside>
      </div>
    </section>
  );
}

/* ---------- Tableau kanban (objectifs, projets) ---------- */
const COLS = [{ id: "todo", name: "À faire" }, { id: "doing", name: "En cours" }, { id: "review", name: "Revue" }, { id: "done", name: "Terminé" }];
const PFX = { projects: "PRJ", goals: "OBJ" };
const Cal = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 7h12M5 1.5v3M11 1.5v3" /></svg>;

function AddCard({ onAdd, onClose }) {
  const [t, setT] = useState("");
  const submit = () => { const v = t.trim(); if (v) { onAdd(v); setT(""); } else onClose(); };
  return (
    <input className="kb-add" autoFocus aria-label="Titre de la carte" placeholder="Titre, puis Entrée" value={t} onChange={(e) => setT(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") submit(); else if (e.key === "Escape") onClose(); }} onBlur={() => (t.trim() ? submit() : onClose())} />
  );
}

// Nom de colonne qui devient un champ au clic: Entrée valide, Échap annule.
function Inline({ value, onSave, children }) {
  const [on, setOn] = useState(false);
  if (!on) return <button type="button" className="kb-name" title="Renommer" onClick={() => setOn(true)}>{children}</button>;
  return (
    <input className="kb-edit" autoFocus aria-label="Nom de la colonne" defaultValue={value}
      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== value) onSave(v); setOn(false); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") { e.currentTarget.value = value; e.currentTarget.blur(); } }} />
  );
}

// Fiche d'une carte: toute l'édition passe ici, la carte reste une vue de lecture.
function CardDialog({ x, cols, tags, code, onPatch, onDelete, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="kb-dlg" aria-labelledby="kb-dlg-t" onClose={() => { if (!x.t.trim()) onPatch({ t: "Sans titre" }); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
      <div className="kb-dlg-in">
        <header><h2 id="kb-dlg-t">Modifier la carte</h2><span className="kb-code">{code}</span></header>
        <label className="kb-f"><span>Titre</span><input value={x.t} onChange={(e) => onPatch({ t: e.target.value })} /></label>
        <label className="kb-f"><span>Description</span><textarea rows={4} value={x.n ?? ""} placeholder="Ce qu'il faut livrer, en une ou deux phrases" onChange={(e) => onPatch({ n: e.target.value })} /></label>
        <div className="kb-2">
          <label className="kb-f"><span>Étiquette</span><input list="kb-tags" value={x.tag ?? ""} placeholder="Design, Backend…" onChange={(e) => onPatch({ tag: e.target.value })} /><datalist id="kb-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist></label>
          <div className="kb-f"><span>Priorité</span><Select label="Priorité" value={x.p ?? "normal"} options={[["high", "Haute"], ["normal", "Normale"], ["low", "Basse"]]} onChange={(p) => onPatch({ p })} /></div>
          <div className="kb-f"><span>Colonne</span><Select label="Colonne" value={x.col} options={cols.map((c) => [c.id, c.name])} onChange={(col) => onPatch({ col })} /></div>
          <div className="kb-f"><span>Échéance</span><DatePick label="Échéance" placeholder="Aucune" value={x.d ?? ""} onChange={(d) => onPatch({ d })} /></div>
        </div>
        <div className="kb-f"><span>Avancement <b>{x.v ?? 0} %</b></span><SloshSlider key={x.id} value={x.v ?? 0} step={5} label="Avancement" onChange={(v) => onPatch({ v })} /></div>
        <footer>
          <button type="button" className="dx-btn ghost" onClick={() => { onDelete(); ref.current.close(); }}>Supprimer</button>
          <button type="button" className="dx-btn primary" onClick={() => ref.current.close()}>Terminé</button>
        </footer>
      </div>
    </dialog>
  );
}

export function KanbanPage({ id, title, intro, label }) {
  const [items, setItems] = useLocalList(id);
  const [saved, setCols] = useLocalList(`${id}_cols`);
  const cols = saved.length ? saved : COLS;
  const [adding, setAdding] = useState(null);
  const [edit, setEdit] = useState(null);
  const [menu, setMenu] = useState(null);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null); // { col, id }
  const [q, setQ] = useState("");
  const [pf, setPf] = useState("all");
  const last = cols[cols.length - 1].id;
  const pfx = PFX[id.split("_")[0]] ?? "TSK";
  const col = (x) => (cols.some((c) => c.id === x.col) ? x.col : cols[0].id);
  // numéro stable par carte (PRJ-01…): attribué une fois aux cartes qui n'en ont pas
  useEffect(() => {
    if (items.every((x) => x.no)) return;
    let n = Math.max(0, ...items.map((x) => x.no ?? 0));
    setItems(items.map((x) => (x.no ? x : { ...x, no: ++n })));
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!menu) return undefined;
    const off = (e) => { if (!e.target.closest(".kb-menu")) setMenu(null); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [menu]);
  const patch = (i, p) => setItems(items.map((x) => (x.id === i ? { ...x, ...p, v: p.col === last && p.v === undefined ? 100 : (p.v ?? x.v) } : x)));
  const drop = (to, before) => {
    const x = items.find((y) => y.id === drag);
    setDrag(null); setOver(null);
    if (!x || x.id === before) return;
    const rest = items.filter((y) => y.id !== x.id);
    const at = before ? rest.findIndex((y) => y.id === before) : rest.length;
    setItems([...rest.slice(0, at), { ...x, col: to, v: to === last ? 100 : x.v }, ...rest.slice(at)]);
  };
  const rename = (cid, name) => setCols(cols.map((c) => (c.id === cid ? { ...c, name } : c)));
  const addCol = () => { const c = { id: crypto.randomUUID(), name: "Nouvelle colonne" }; setCols([...cols.slice(0, -1), c, cols[cols.length - 1]]); };
  const shift = (i, d) => { const n = [...cols]; [n[i], n[i + d]] = [n[i + d], n[i]]; setCols(n); setMenu(null); };
  const delCol = (c) => {
    setMenu(null);
    const to = cols[0].id === c.id ? cols[1] : cols[0];
    const n = items.filter((x) => col(x) === c.id).length;
    if (n && !window.confirm(`Supprimer « ${c.name} » ? Ses ${n} cartes passent dans « ${to.name} ».`)) return;
    setItems(items.map((x) => (col(x) === c.id ? { ...x, col: to.id } : x)));
    setCols(cols.filter((y) => y.id !== c.id));
  };
  const now = today();
  const late = (x) => x.d && x.d < now && col(x) !== last;
  const done = items.filter((x) => col(x) === last).length;
  const nLate = items.filter(late).length;
  const shown = items.filter((x) => (pf === "all" || (x.p ?? "normal") === pf) && `${x.t} ${x.n ?? ""} ${x.tag ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const filtering = q.trim() !== "" || pf !== "all";
  const tags = [...new Set(items.map((x) => x.tag).filter(Boolean))];
  const cur = items.find((x) => x.id === edit);
  const code = (x) => `${pfx}-${String(x.no ?? 0).padStart(2, "0")}`;
  return (
    <section className="page-view">
      <PageHead title={title} sub={items.length ? `${done} sur ${items.length} terminés${nLate ? ` · ${nLate} en retard` : ""}` : intro}>
        <button type="button" className="dx-btn primary" onClick={() => setAdding(cols[0].id)}>+ Nouvelle carte</button>
      </PageHead>
      <div className="kb-bar">
        <input type="search" aria-label="Filtrer les cartes" placeholder="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg" role="group" aria-label="Priorité">
          {[["all", "Toutes"], ["high", "Haute"], ["normal", "Normale"], ["low", "Basse"]].map(([k, n]) => <button key={k} type="button" aria-pressed={pf === k} onClick={() => setPf(k)}>{n}</button>)}
        </div>
        <button type="button" className="dx-btn ghost" onClick={addCol}>+ Colonne</button>
      </div>
      <div className="kb">
        {cols.map((c, ci) => {
          const list = shown.filter((x) => col(x) === c.id);
          const total = items.filter((x) => col(x) === c.id).length;
          return (
            <section className={`kb-col${over?.col === c.id ? " is-over" : ""}${ci === cols.length - 1 ? " is-done" : ""}`} key={c.id} data-col={c.id} aria-label={c.name}
              onDragOver={(e) => { if (drag) { e.preventDefault(); if (over?.col !== c.id || over?.id) setOver({ col: c.id, id: null }); } }}
              onDrop={() => drop(c.id, null)}>
              <header>
                <Inline value={c.name} onSave={(v) => rename(c.id, v)}><h3>{c.name}</h3></Inline>
                <small>{filtering && list.length !== total ? `${list.length}/${total}` : total}</small>
                <button className="dx-iconbtn" type="button" aria-label={`${label}: ajouter dans ${c.name}`} onClick={() => setAdding(c.id)}>+</button>
                <div className="kb-menu">
                  <button className="dx-iconbtn" type="button" aria-label={`Options de ${c.name}`} aria-haspopup="menu" aria-expanded={menu === c.id} onClick={() => setMenu(menu === c.id ? null : c.id)}>⋮</button>
                  {menu === c.id && (
                    <div className="pop list" role="menu">
                      {ci > 0 && <button className="opt" role="menuitem" type="button" onClick={() => shift(ci, -1)}>Décaler à gauche</button>}
                      {ci < cols.length - 1 && <button className="opt" role="menuitem" type="button" onClick={() => shift(ci, 1)}>Décaler à droite</button>}
                      {cols.length > 2 && <button className="opt" role="menuitem" type="button" onClick={() => delCol(c)}>Supprimer la colonne</button>}
                    </div>
                  )}
                </div>
              </header>
              {list.map((x) => (
                <div className={`kb-card${drag === x.id ? " is-drag" : ""}${over?.id === x.id ? " drop-before" : ""}`} key={x.id} draggable role="button" tabIndex={0} aria-label={`Modifier ${x.t}`}
                  onClick={() => setEdit(x.id)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setEdit(x.id); } }}
                  onDragStart={(e) => { setDrag(x.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDrag(null); setOver(null); }}
                  onDragOver={(e) => { if (drag && drag !== x.id) { e.preventDefault(); e.stopPropagation(); setOver({ col: c.id, id: x.id }); } }}
                  onDrop={(e) => { e.stopPropagation(); drop(c.id, x.id); }}>
                  <div className="kb-tags">
                    <span className={`dx-prio p${prio(x.p ?? "normal")[1]}`}>⚑ {prio(x.p ?? "normal")[0]}</span>
                    {x.tag && <span className="kb-tag">{x.tag}</span>}
                    <span className="kb-code">{code(x)}</span>
                  </div>
                  <b className="kb-title">{x.t}</b>
                  {x.n && <p className="kb-desc">{x.n}</p>}
                  {x.d && <span className={`kb-date${late(x) ? " is-late" : ""}`}><Cal />{fmt(new Date(`${x.d}T00:00`), { day: "numeric", month: "short", year: "numeric" })}{late(x) && " · en retard"}</span>}
                  {(x.v ?? 0) > 0 && (
                    <div className="kb-meter"><span>{x.v === 100 ? "Terminé" : "Avancement"}</span><div><i style={{ width: `${x.v}%` }} /></div><b>{x.v} %</b></div>
                  )}
                </div>
              ))}
              {adding === c.id
                ? <AddCard onClose={() => setAdding(null)} onAdd={(t) => setItems([...items, { id: crypto.randomUUID(), t, v: c.id === last ? 100 : 0, col: c.id, p: "normal", no: Math.max(0, ...items.map((y) => y.no ?? 0)) + 1 }])} />
                : <button type="button" className="kb-new" onClick={() => setAdding(c.id)}>+ {list.length === 0 && filtering && total ? "Aucune carte ne correspond" : "Nouvelle carte"}</button>}
            </section>
          );
        })}
      </div>
      {cur && <CardDialog key={cur.id} x={{ ...cur, col: col(cur) }} cols={cols} tags={tags} code={code(cur)} onPatch={(p) => patch(cur.id, p)} onDelete={() => setItems(items.filter((y) => y.id !== cur.id))} onClose={() => setEdit(null)} />}
    </section>
  );
}

/* ---------- Focus ---------- */
const MODES = [["Focus", 25], ["Long", 50], ["Pause", 5], ["Minuteur", 10]]; // le 4e: durée libre, hors cycle pomodoro
const R = 112, C = 2 * Math.PI * R, CYCLE = 4;

export function FocusPage() {
  const [mode, setMode] = useState(0);
  const [timerMin, setTimerMin] = useState(10);
  const minutesOf = (i) => (i === 3 ? Math.max(1, timerMin) : MODES[i][1]);
  const total = minutesOf(mode) * 60;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const [goal, setGoal] = useState("");
  const [log, setLog] = useLocalList("focus_log"); // une entrée par session terminée, par appareil
  useEffect(() => { setRunning(false); setLeft(minutesOf(mode) * 60); }, [mode, timerMin]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneToday = log.filter((l) => l.day === today());
  const minutes = doneToday.reduce((n, l) => n + l.min, 0);
  const inCycle = doneToday.length % CYCLE;
  useEffect(() => {
    if (!running) return undefined;
    const end = Date.now() + left * 1000; // l'échéance absolue évite la dérive quand l'onglet est en arrière-plan
    const id = window.setInterval(() => {
      const l = Math.round((end - Date.now()) / 1000);
      if (l > 0) { setLeft(l); return; }
      setRunning(false);
      if (mode === 2) { setMode(0); return; }
      if (mode === 3) return; // un minuteur libre ne compte pas dans le cycle
      setLog((x) => [...x, { id: crypto.randomUUID(), day: today(), min: MODES[mode][1], goal: goal.trim() }]);
      setMode((doneToday.length + 1) % CYCLE === 0 ? 1 : 2); // pause courte, longue après 4 sessions
    }, 250);
    return () => window.clearInterval(id);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  useEffect(() => {
    if (!running) return undefined;
    const old = document.title;
    document.title = `${mm}:${ss} · ${MODES[mode][0]}`;
    return () => { document.title = old; };
  }, [running, mm, ss, mode]);
  const rest = mode === 2;
  return (
    <section className="page-view">
      <PageHead title="Focus" sub={minutes ? `${minutes} min aujourd'hui` : "Une session à la fois"} />
      <div className="focus">
        <div className="focus-main">
          <div className="seg" role="group" aria-label="Durée">
            {MODES.map(([n], i) => <button type="button" key={n} aria-pressed={mode === i} onClick={() => setMode(i)}>{n} <span>{minutesOf(i)} min</span></button>)}
          </div>
          {mode === 3 && !running && <TimeScrubber format="24h" step="5" start={timerMin} onChange={setTimerMin} />}
          <div className={`ring${rest ? " rest" : ""}`}>
            <svg viewBox="0 0 240 240" aria-hidden="true">
              <circle cx="120" cy="120" r={R} className="ring-bg" />
              <circle cx="120" cy="120" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - left / total)} />
            </svg>
            <div className="ring-in">
              <div className="dx-timer" role="timer" aria-live="off">{mm}:{ss}</div>
              <small>{rest ? "Respire" : running ? "En cours" : "Prêt"}</small>
            </div>
          </div>
          <input className="focus-goal" aria-label="Sur quoi tu travailles" placeholder="Sur quoi tu travailles" maxLength={80} value={goal} onChange={(e) => setGoal(e.target.value)} />
          <div className="dx-row">
            <button className="dx-btn primary big" type="button" onClick={() => setRunning((v) => !v)}>{running ? "Pause" : left < total ? "Reprendre" : "Démarrer"}</button>
            <button className="dx-btn big" type="button" onClick={() => { setRunning(false); setLeft(total); }}>Réinitialiser</button>
          </div>
        </div>
        <aside className="dx-card focus-day" aria-label="Aujourd'hui">
          <h2>Aujourd'hui</h2>
          <div className="focus-stat"><b>{minutes}</b><span>min de focus</span></div>
          <div className="focus-cycle" role="img" aria-label={`${inCycle} session${inCycle > 1 ? "s" : ""} sur ${CYCLE} avant la pause longue`}>
            {Array.from({ length: CYCLE }, (_, i) => <i key={i} className={i < inCycle ? "on" : ""} />)}
          </div>
          <small>{inCycle} sur {CYCLE} avant la pause longue</small>
          {doneToday.length > 0 && (
            <ul className="focus-log">
              {doneToday.slice(-5).reverse().map((l) => <li key={l.id}><span>{l.goal || "Session sans titre"}</span><em>{l.min} min</em></li>)}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}

/* ---------- Système ---------- */
const genPassword = () => {
  const abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => abc[n % abc.length]).join("");
};

/* Outil fermé: l'admin crée les comptes ici. La section reste cachée si l'API refuse (compte non admin). */
function Accounts({ api, token, me }) {
  const [list, setList] = useState(null);
  const [email, setEmail] = useState("");
  const [recovery, setRecovery] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const load = () => request(api, token, "GET", "/admin/users").then(setList).catch(() => setList(false));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (list === false || list === null) return null;
  const create = async (e) => {
    e.preventDefault();
    try {
      setError(""); setDone("");
      await request(api, token, "POST", "/admin/users", { email: email.trim(), recovery_email: recovery.trim(), password });
      setDone(`Compte créé pour ${email.trim()}. Transmets-lui son mot de passe.`);
      setEmail(""); setRecovery(""); setPassword(""); load();
    } catch (x) { setError(x.message); }
  };
  return (
    <>
      <h2 className="sub-h">Comptes <small>{list.length}</small></h2>
      <form className="quick acc-form" onSubmit={create} autoComplete="off">
        <input type="email" aria-label="Adresse @paranoiastudio.fr du nouveau compte" placeholder="prenom@paranoiastudio.fr" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="email" aria-label="Adresse perso de secours" placeholder="Adresse perso de secours" value={recovery} onChange={(e) => setRecovery(e.target.value)} required />
        <input className="mono" aria-label="Mot de passe, 12 caractères minimum" placeholder="Mot de passe, 12 caractères minimum" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" required minLength={12} />
        <button className="dx-btn" type="button" onClick={() => setPassword(genPassword())}>Générer</button>
        <button className="dx-btn primary" type="submit" disabled={!email.includes("@") || !recovery.includes("@") || password.length < 12}>Créer le compte</button>
      </form>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {done && <p className="acc-ok" role="status">{done}</p>}
      <ul className="rows">
        {list.map((u) => (
          <li className="row-item" key={u.id}>
            <span className="lead" aria-hidden="true">{u.email[0]?.toUpperCase()}</span>
            <div><b>{u.email}</b><small>{u.recovery_email ? `Secours : ${u.recovery_email} · ` : "Pas d’adresse de secours · "}Créé le {fmt(new Date(`${u.created_at.slice(0, 10)}T12:00`), { day: "numeric", month: "long", year: "numeric" })}</small></div>
            {u.email === me && <span className="tag">Vous</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

const sessionDate = (s) => new Date(`${s.slice(0, 10)}T${s.slice(11, 16)}:00Z`).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function Sessions({ api, token }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const load = () => request(api, token, "GET", "/auth/sessions").then(setList).catch((x) => setError(x.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (path) => {
    try { setError(""); await request(api, token, "DELETE", path); await load(); } catch (x) { setError(x.message); }
  };
  if (!list) return error ? <p className="inline-error" role="alert">{error}</p> : null;
  const others = list.filter((s) => !s.current).length;
  return (
    <section className="set-block">
      <div className="set-h">
        <div><h2>Sessions</h2><p>Les appareils connectés à ce compte</p></div>
        <button className="dx-btn" type="button" disabled={!others} onClick={() => run("/auth/sessions")}>Déconnecter les autres</button>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <ul className="rows">
        {list.map((s) => (
          <li className="row-item" key={s.id}>
            <div><b>{s.current ? "Cet appareil" : "Autre appareil"}</b><small>Connecté le {sessionDate(s.created_at)}</small></div>
            {s.current ? <span className="tag">Actuelle</span> : <button className="dx-btn" type="button" onClick={() => run(`/auth/sessions/${s.id}`)}>Révoquer</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Avatar({ src, label, size = 64 }) {
  return (
    <span className="dx-av" style={{ width: size, height: size, fontSize: size / 2.6 }} aria-hidden="true">
      {src ? <img src={src} alt="" /> : label[0]?.toUpperCase() ?? "P"}
    </span>
  );
}

function Form({ title, hint, onSubmit, children, submit, disabled }) {
  const [msg, setMsg] = useState({ ok: "", err: "" });
  const [busy, setBusy] = useState(false);
  return (
    <form className="set-form" autoComplete="off" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try { setMsg({ ok: await onSubmit(), err: "" }); } catch (x) { setMsg({ ok: "", err: frError(x) }); }
      setBusy(false);
    }}>
      <div><b>{title}</b>{hint && <small>{hint}</small>}</div>
      <div className="set-fields">{children}</div>
      <div className="set-foot">
        <button className="dx-btn" type="submit" disabled={disabled || busy}>{submit}</button>
        {msg.err && <span className="set-err" role="alert">{msg.err}</span>}
        {msg.ok && <span className="set-ok" role="status">{msg.ok}</span>}
      </div>
    </form>
  );
}

export function SettingsPage({ api, token, user, onUser, name, onName, onProfile, theme, onTheme, calm, onCalm }) {
  const [draft, setDraft] = useState(name);
  const [photoErr, setPhotoErr] = useState("");
  const [mail, setMail] = useState({ email: "", password: "" });
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  useEffect(() => { setDraft(name); }, [name]);
  const clean = draft.trim();
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoErr("");
    let avatar;
    try { avatar = await resizeAvatar(file); } catch { return setPhotoErr("Image illisible, essaie un JPEG ou un PNG."); }
    try { await onProfile({ avatar }); } catch (x) { setPhotoErr(x.code === "not_found" ? "Le serveur n'a pas la route profil: redémarre l'API." : frError(x)); }
  };
  return (
    <section className="page-view">
      <PageHead title="Paramètres" sub="Ton profil, ton compte, l'apparence et la sécurité" />
      <section className="set-block">
        <div className="set-h"><div><h2>Profil</h2><p>Visible dans le menu et la barre latérale</p></div></div>
        <div className="set-row">
          <span>Photo</span>
          <div className="set-photo">
            <Avatar src={user?.avatar} label={name} />
            <label className="dx-btn">Changer la photo<input type="file" accept="image/*" hidden onChange={pick} /></label>
            {user?.avatar && <button className="dx-btn" type="button" onClick={() => onProfile({ avatar: null }).catch(() => setPhotoErr("Action impossible."))}>Retirer</button>}
            {photoErr && <span className="set-err" role="alert">{photoErr}</span>}
          </div>
        </div>
        <form className="set-row" onSubmit={(e) => { e.preventDefault(); if (clean) onName(clean); }}>
          <label htmlFor="set-name">Pseudo ou prénom</label>
          <div className="set-ctl">
            <input id="set-name" value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} />
            <button className="dx-btn" type="submit" disabled={!clean || clean === name}>Enregistrer</button>
          </div>
        </form>
      </section>
      <section className="set-block">
        <div className="set-h"><div><h2>Compte</h2><p>Connexion avec <b>{user?.email}</b></p></div></div>
        <Form title="Adresse email" hint="Confirme avec ton mot de passe actuel" submit="Changer l'adresse"
          disabled={!mail.email.includes("@") || !mail.password}
          onSubmit={async () => {
            await request(api, token, "PUT", "/me/email", mail);
            onUser({ email: mail.email.trim().toLowerCase() });
            setMail({ email: "", password: "" });
            return "Adresse changée. Utilise-la à ta prochaine connexion.";
          }}>
          <input type="email" aria-label="Nouvelle adresse" placeholder="nouvelle@adresse.fr" value={mail.email} onChange={(e) => setMail({ ...mail, email: e.target.value })} />
          <input type="password" aria-label="Mot de passe actuel" placeholder="Mot de passe actuel" value={mail.password} onChange={(e) => setMail({ ...mail, password: e.target.value })} />
        </Form>
        <Form title="Mot de passe" hint="12 caractères minimum, les autres appareils sont déconnectés" submit="Changer le mot de passe"
          disabled={!pw.current || pw.next.length < 12 || pw.next !== pw.again}
          onSubmit={async () => {
            await request(api, token, "PUT", "/me/password", { current: pw.current, new: pw.next });
            setPw({ current: "", next: "", again: "" });
            return "Mot de passe changé.";
          }}>
          <input type="password" aria-label="Mot de passe actuel" placeholder="Mot de passe actuel" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input type="password" aria-label="Nouveau mot de passe" placeholder="Nouveau, 12 caractères minimum" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <input type="password" aria-label="Confirmer le nouveau mot de passe" placeholder="Confirmer le nouveau" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
        </Form>
      </section>
      <section className="set-block">
        <div className="set-h"><div><h2>Apparence</h2><p>Enregistrée sur cet appareil</p></div></div>
        <div className="set-row">
          <span id="set-theme">Thème</span>
          <div className="seg" role="group" aria-labelledby="set-theme">
            {[["dark", "Sombre"], ["light", "Clair"]].map(([id, label]) => <button key={id} type="button" aria-pressed={theme === id} onClick={() => onTheme(id)}>{label}</button>)}
          </div>
        </div>
        <div className="set-row">
          <span id="set-motion">Animations</span>
          <div className="seg" role="group" aria-labelledby="set-motion">
            {[[false, "Normales"], [true, "Réduites"]].map(([v, label]) => <button key={label} type="button" aria-pressed={calm === v} onClick={() => onCalm(v)}>{label}</button>)}
          </div>
        </div>
      </section>
      <Sessions api={api} token={token} />
    </section>
  );
}

export function SystemPage({ apiState, user, workspaces, api, token }) {
  const off = apiState === "Indisponible";

  const applyUrl = (url) => {
    try {
      if (!url || url === "http://127.0.0.1:8080") {
        localStorage.removeItem("paranoia_custom_api_url");
      } else {
        localStorage.setItem("paranoia_custom_api_url", url);
      }
      window.location.reload();
    } catch {}
  };

  return (
    <section className="page-view">
      <PageHead title="Système" sub="Connexion à l'API et session en cours" />
      <dl className="kv">
        <div><dt>API</dt><dd><i className={`dx-dot${off ? " off" : ""}`} />{off ? "Indisponible" : "En ligne"}</dd></div>
        <div><dt>Service</dt><dd>{off ? "—" : apiState}</dd></div>
        <div><dt>Adresse</dt><dd className="mono">{api}</dd></div>
        <div><dt>Session</dt><dd>{user?.email ?? "Compte administrateur"}</dd></div>
        <div><dt>Espaces accessibles</dt><dd>{workspaces.length}</dd></div>
      </dl>

      <section className="dx-card" style={{ padding: "16px", marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>Serveur & Environnement</h3>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--mute)" }}>
          Basculez entre votre serveur local et votre serveur de production VPS (Caddy).
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            className={`dx-btn ${api.includes("127.0.0.1") || api.includes("localhost") ? "primary" : ""}`}
            type="button"
            onClick={() => applyUrl("http://127.0.0.1:8080")}
          >
            Local (127.0.0.1:8080)
          </button>
          <button
            className={`dx-btn ${api.includes("api.paranoiastudio.fr") ? "primary" : ""}`}
            type="button"
            onClick={() => applyUrl("https://api.paranoiastudio.fr")}
          >
            Production VPS (api.paranoiastudio.fr)
          </button>
        </div>
      </section>

      <Accounts api={api} token={token} me={user?.email} />
    </section>
  );
}
