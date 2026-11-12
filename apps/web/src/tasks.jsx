import { useEffect, useState } from "react";
import { DatePick, Select } from "./controls";
import { today, ymd } from "./lib";
import { Empty, PageHead } from "./ui";
import { NEXT_PRIO, PRIORITIES, patchTask, prio, request, toggleTask } from "./views";

const when = (d) => (d ? new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const RECURRENCES = [["none", "Aucune"], ["daily", "Chaque jour"], ["weekly", "Chaque semaine"], ["monthly", "Chaque mois"]];
const RECUR_LABEL = { daily: "Chaque jour", weekly: "Chaque semaine", monthly: "Chaque mois" };
const STATUSES = [["todo", "À faire"], ["in_progress", "En cours"], ["done", "Terminée"]];
const VIEWS = [["list", "Liste"], ["kanban", "Kanban"], ["calendar", "Calendrier"]];
const TASK_ERR = {
  conflict: "Cette tâche est encore bloquée: termine d'abord la tâche qui la bloque.",
  forbidden: "Ton rôle dans cette équipe ne permet pas cette action.",
  invalid_input: "Valeur refusée (un lien de blocage doit rester dans la même équipe et sans boucle).",
};
const taskError = (e) => TASK_ERR[e.code] ?? e.message;
const dueOf = (t) => (t.due_date ? String(t.due_date).slice(0, 10) : "");

function Comments({ task, api, token, onCount }) {
  const [items, setItems] = useState(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const load = () => request(api, token, "GET", `/tasks/${task.id}/comments`).then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn) => { try { setError(""); await fn(); await load(); onCount(); } catch (e) { setError(taskError(e)); } };
  const send = (e) => { e.preventDefault(); act(async () => { await request(api, token, "POST", `/tasks/${task.id}/comments`, { body: body.trim() }); setBody(""); }); };
  return (
    <div className="cm">
      {items === null && !error && <small className="cm-empty">Chargement…</small>}
      {items?.length === 0 && <small className="cm-empty">Aucun commentaire.</small>}
      <ul>
        {items?.map((c) => (
          <li key={c.id}>
            <p><b>{c.author}</b><small>{when(c.created_at)}</small></p>
            <p className="cm-body">{c.body}</p>
            <button className="dx-x" type="button" aria-label="Supprimer le commentaire" onClick={() => act(() => request(api, token, "DELETE", `/comments/${c.id}`))}>×</button>
          </li>
        ))}
      </ul>
      <form className="quick" onSubmit={send}>
        <input aria-label={`Commenter ${task.title}`} placeholder="Écrire un commentaire" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="dx-btn primary" type="submit" disabled={!body.trim()}>Envoyer</button>
      </form>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}

/* Panneau de réglages avancés d'une tâche: répétition, tâche bloquante, sous-tâches. */
function Details({ task, run, api, token, all, sub }) {
  const [title, setTitle] = useState("");
  const edit = (patch) => run(() => patchTask(api, token, task, patch));
  const blockers = all.filter((x) => x.id !== task.id && !x.parent_id && x.status !== "done" && x.status !== "cancelled" && x.id !== task.parent_id);
  const current = all.find((x) => x.id === task.blocked_by);
  const options = [["none", "Aucune"], ...(current && !blockers.includes(current) ? [current] : []).concat(blockers).map((x) => [x.id, x.title])];
  const add = (e) => {
    e.preventDefault();
    run(async () => { await request(api, token, "POST", "/tasks", { title: title.trim(), parent_id: task.id, workspace_id: task.workspace_id ?? undefined }); setTitle(""); });
  };
  return (
    <div className="tl-more">
      <div className="tl-opts">
        <span>Répétition<Select label={`Répétition de ${task.title}`} options={RECURRENCES} value={task.recurrence} onChange={(v) => edit({ recurrence: v })} /></span>
        <span>Bloquée par<Select label={`Tâche bloquante de ${task.title}`} options={options} value={task.blocked_by ?? "none"} onChange={(v) => edit({ blocked_by: v === "none" ? null : v })} /></span>
      </div>
      {!sub && (
        <form className="quick" onSubmit={add}>
          <input aria-label={`Nouvelle sous-tâche de ${task.title}`} placeholder="Nouvelle sous-tâche" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="dx-btn primary" type="submit" disabled={!title.trim()}>Ajouter</button>
        </form>
      )}
    </div>
  );
}

/* Ligne de base de données: le titre, l'échéance et la priorité se modifient sur place. */
function TaskLine({ task, run, api, token, members, all, subs = [], sub }) {
  const [talk, setTalk] = useState(false);
  const [more, setMore] = useState(false);
  const done = task.status === "done";
  const [label, level] = prio(task.priority);
  const due = dueOf(task);
  const late = !done && due && due < today();
  const edit = (patch) => run(() => patchTask(api, token, task, patch));
  const title = (e) => {
    const t = e.target.value.trim();
    if (t && t !== task.title) edit({ title: t }); else e.target.value = task.title;
  };
  return (
    <>
      <li className={`tl${done ? " is-done" : ""}`}>
        <button className="chk" type="button" aria-pressed={done} aria-label={`${task.title}: marquer comme ${done ? "à faire" : "terminée"}`} onClick={() => run(() => toggleTask(api, token, task))} />
        <div className="tl-main">
          <input key={task.title} className="tl-title" aria-label="Titre de la tâche" defaultValue={task.title} onBlur={title}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = task.title; e.currentTarget.blur(); } }} />
          {task.description && <small>{task.description}</small>}
          <div className="tl-meta">
            {task.workspace_id && members && <Select label={`Assignation de ${task.title}`} options={[["none", "Non assignée"], ...members.map((m) => [m.id, m.name])]} value={task.assignee_id ?? "none"} onChange={(v) => edit({ assignee_id: v === "none" ? null : v })} />}
            {task.blocked && <span className="tag">Bloquée</span>}
            {task.recurrence !== "none" && <span className="tag">↻ {RECUR_LABEL[task.recurrence]}</span>}
            {task.subtasks > 0 && <span className="tag">{task.subtasks_done}/{task.subtasks} sous-tâches</span>}
            {task.workspace_id && <button className="tl-talk" type="button" aria-expanded={talk} onClick={() => setTalk(!talk)}>{task.comments ? `${task.comments} commentaire${task.comments > 1 ? "s" : ""}` : "Commenter"}</button>}
            <button className="tl-talk" type="button" aria-expanded={more} onClick={() => setMore(!more)}>Détails</button>
          </div>
        </div>
        <DatePick cls={`tl-date${late ? " is-late" : ""}`} label={`Échéance de ${task.title}`} placeholder="Aucune" value={due} onChange={(d) => edit({ due_date: d })} />
        <button className={`dx-prio p${level}`} type="button" aria-label={`Priorité ${label.toLowerCase()}, changer`} onClick={() => edit({ priority: NEXT_PRIO[task.priority] ?? "normal" })}>{label}</button>
        <button className="dx-x" type="button" aria-label={`Supprimer ${task.title}`} onClick={() => run(() => request(api, token, "DELETE", `/tasks/${task.id}`))}>×</button>
        {more && <Details task={task} run={run} api={api} token={token} all={all} sub={sub} />}
        {talk && <Comments task={task} api={api} token={token} onCount={() => run(async () => {})} />}
      </li>
      {subs.length > 0 && (
        <li className="tl-sub"><ul className="tl-list">{subs.map((s) => <TaskLine key={s.id} task={s} run={run} api={api} token={token} members={members} all={all} sub />)}</ul></li>
      )}
    </>
  );
}

function TaskGroup({ name, items, run, api, token, head, members, all }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="tg">
      <button className="tg-h" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <i aria-hidden="true" />{name}<small>{items.length}</small>
      </button>
      {open && (
        <>
          {head && <div className="tl-head" aria-hidden="true"><span>Tâche</span><span>Échéance</span><span>Priorité</span></div>}
          <ul className="tl-list">{items.map((t) => <TaskLine key={t.id} task={t} run={run} api={api} token={token} members={members} all={all} subs={all.filter((s) => s.parent_id === t.id)} />)}</ul>
        </>
      )}
    </section>
  );
}

function Kanban({ tasks, run, api, token }) {
  return (
    <div className="tk">
      {STATUSES.map(([status, name]) => {
        const items = tasks.filter((t) => t.status === status || (status === "todo" && t.status === "cancelled"));
        return (
          <section key={status} className="tk-col" aria-label={name}>
            <h2>{name}<small>{items.length}</small></h2>
            {items.length === 0 && <p className="tk-empty">Vide</p>}
            {items.map((t) => (
              <article key={t.id} className="tk-card">
                <b>{t.title}</b>
                <div className="tk-meta">
                  <span className={`dx-prio p${prio(t.priority)[1]}`}>{prio(t.priority)[0]}</span>
                  {dueOf(t) && <small>{dueOf(t).split("-").reverse().join("/")}</small>}
                  {t.assignee && <small>{t.assignee}</small>}
                  {t.blocked && <span className="tag">Bloquée</span>}
                </div>
                <Select label={`Statut de ${t.title}`} options={STATUSES} value={t.status === "cancelled" ? "todo" : t.status} onChange={(v) => run(() => patchTask(api, token, t, { status: v }))} />
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function CalendarView({ tasks }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const y = month.getFullYear(), m = month.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => new Date(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const byDay = {};
  tasks.filter((t) => dueOf(t) && t.status !== "cancelled").forEach((t) => { (byDay[dueOf(t)] ??= []).push(t); });
  const loose = tasks.filter((t) => !dueOf(t) && t.status !== "done" && t.status !== "cancelled").length;
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(month);
  const now = today();
  return (
    <section className="tc" aria-label="Calendrier des tâches">
      <div className="tc-h">
        <h2>{label.charAt(0).toUpperCase() + label.slice(1)}</h2>
        <div>
          <button className="dx-iconbtn" type="button" onClick={() => setMonth(new Date(y, m - 1, 1))} aria-label="Mois précédent">‹</button>
          <button className="dx-iconbtn" type="button" onClick={() => setMonth(new Date(y, m + 1, 1))} aria-label="Mois suivant">›</button>
        </div>
      </div>
      <div className="tc-grid">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => <span className="tc-w" key={d}>{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <div className="tc-d is-off" key={i} />;
          const key = ymd(d), list = byDay[key] ?? [];
          return (
            <div className={`tc-d${key === now ? " is-today" : ""}`} key={i}>
              <b>{d.getDate()}</b>
              {list.slice(0, 3).map((t) => <span key={t.id} className={`tc-t${t.status === "done" ? " is-done" : ""}`} title={t.title}>{t.title}</span>)}
              {list.length > 3 && <small>+{list.length - 3}</small>}
            </div>
          );
        })}
      </div>
      {loose > 0 && <p className="tc-loose">{loose} tâche{loose > 1 ? "s" : ""} sans échéance, visible{loose > 1 ? "s" : ""} dans la liste.</p>}
    </section>
  );
}

export function TasksPage({ tasks, token, onRefresh, api, workspace }) {
  const team = workspace?.id !== undefined;
  const real = team && workspace.id !== "local-account";
  const canWrite = !team || (real && workspace.role !== "viewer");
  const [members, setMembers] = useState(null);
  useEffect(() => {
    setMembers(null);
    if (real) request(api, token, "GET", `/workspaces/${workspace.id}/members`).then(setMembers).catch(() => setMembers([]));
  }, [api, token, real, workspace?.id]);
  const [view, setView] = useState(() => { try { return localStorage.getItem("paranoia_tasks_view") ?? "list"; } catch { return "list"; } });
  const pick = (v) => { setView(v); try { localStorage.setItem("paranoia_tasks_view", v); } catch { /* stockage indisponible */ } };
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("normal");
  const [due, setDue] = useState("");
  const [error, setError] = useState("");
  const run = async (fn) => { try { setError(""); await fn(); onRefresh(); } catch (e) { setError(taskError(e)); } };
  const top = tasks.filter((t) => !t.parent_id);
  const open = top.filter((t) => t.status !== "done"), done = top.filter((t) => t.status === "done");
  const add = (e) => {
    e.preventDefault();
    run(async () => { await request(api, token, "POST", "/tasks", { title: title.trim(), priority, description: "", status: "todo", due_date: due || null, ...(real ? { workspace_id: workspace.id } : {}) }); setTitle(""); setDue(""); });
  };
  const sub = team && !real ? "Crée une équipe pour partager des tâches" : top.length ? `${open.length} à faire, ${done.length} terminées${team ? ` · ${workspace.name}` : ""}` : team ? `Tâches de ${workspace.name}, visibles par toute l'équipe` : "Ce qui doit avancer, dans l'ordre où tu le fais";
  return (
    <section className="page-view">
      <PageHead title="Tâches" sub={sub}>
        {!(team && !real) && (
          <div className="seg" role="group" aria-label="Affichage">
            {VIEWS.map(([id, name]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => pick(id)}>{name}</button>)}
          </div>
        )}
      </PageHead>
      {team && !real ? <Empty title="Aucune équipe" hint="Ouvre Équipes pour créer un espace de travail, puis invite tes collègues." /> : <>
        {canWrite && <form className="quick" onSubmit={add}>
          <input aria-label="Nouvelle tâche" placeholder="Nouvelle tâche" value={title} onChange={(e) => setTitle(e.target.value)} />
          <DatePick label="Échéance" placeholder="Échéance" value={due} onChange={setDue} />
          <Select label="Priorité" options={PRIORITIES} value={priority} onChange={setPriority} />
          <button className="dx-btn primary" type="submit" disabled={!title.trim()}>Ajouter</button>
        </form>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        {tasks.length === 0 ? <Empty title="Aucune tâche" hint="Écris la première ci-dessus et valide avec Entrée." />
          : view === "kanban" ? <Kanban tasks={top} run={run} api={api} token={token} />
          : view === "calendar" ? <CalendarView tasks={tasks} />
          : (
            <>
              {open.length > 0 ? <TaskGroup name="À faire" items={open} run={run} api={api} token={token} members={members} all={tasks} head /> : <Empty title="Tout est fait" hint="Plus rien à traiter pour le moment." />}
              {done.length > 0 && <TaskGroup name="Terminées" items={done} run={run} api={api} token={token} members={members} all={tasks} />}
            </>
          )}
      </>}
    </section>
  );
}
