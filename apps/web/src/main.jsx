import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import "./dashboard.css";
import "./workspace.css";
import "./notebook.css";
import "./calendar.css";
import "./mail.css";
import { NotebookNavigation, RecentPages, usePageLibrary } from "./navigation";
import { Icon } from "./icons";
import { SearchPalette } from "./search";
import { HabitsPage, ListPage, ResourcesPage } from "./local";
import { AuditPage } from "./audit";
import { Bell } from "./notifications";
import { CalendarPage, FocusPage, KanbanPage, NotesPage, OverviewPage, SettingsPage, SystemPage, saveProfile, TeamsPage } from "./views";
import { ProOverview } from "./pro";
import { TasksPage } from "./tasks";
import { MailPage } from "./mail";

const ACCENT = 275; // une seule teinte d'accent pour tout le site
const API_URL = (() => {
  try {
    const custom = localStorage.getItem("paranoia_custom_api_url");
    if (custom) return custom;
  } catch {}
  return import.meta.env.VITE_API_URL || "http://127.0.0.1:8080";
})();

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [theme, setTheme] = useState("dark");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Impossible de se connecter.");
      }

      if (!payload?.token) {
        throw new Error("La réponse du serveur est invalide.");
      }

      localStorage.setItem("paranoia_session_token", payload.token);
      window.location.assign("/");
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? "Le serveur est inaccessible. Vérifie que le backend est lancé."
          : requestError.message,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={`page-shell auth theme-${theme}`}>
      <aside className="auth-hero" aria-hidden="true">
        <div className="auth-hero-body">
          <div className="auth-logo"><span>P</span>Paranoïa One</div>
          <h2>Bon retour.</h2>
          <p>Ton espace de travail t'attend.</p>
          <ol className="auth-steps">
            <li className="on"><b>1</b>Connecte-toi avec ton adresse studio</li>
            <li><b>2</b>Retrouve ton équipe et tes tâches</li>
            <li><b>3</b>Récupération via ton adresse de secours</li>
          </ol>
        </div>
      </aside>

      <section className="auth-panel" aria-labelledby="login-title">
        <button
          className="workspace-theme"
          type="button"
          aria-label={`Activer le mode ${theme === "dark" ? "clair" : "sombre"}`}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? "Mode clair" : "Mode sombre"}
        </button>
        <div className="auth-form">
          <h1 id="login-title">Connexion</h1>
          <p className="auth-sub">Entre ton adresse @paranoiastudio.fr et ton mot de passe.</p>

          <form onSubmit={submit}>
            <label htmlFor="email">Adresse email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="prenom@paranoiastudio.fr"
              required
            />

            <label htmlFor="password">Mot de passe</label>
            <div className="auth-pw">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button type="button" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? "Masquer" : "Afficher"}
              </button>
            </div>

            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Connexion..." : "Se connecter"}
            </button>
          </form>
          <p className="auth-foot">Pas encore de compte ? Il est créé par l'administrateur.</p>
        </div>
      </section>
    </main>
  );
}

function Av({ src, label, sm }) {
  return <span className={`dx-av${sm ? " sm" : ""}`} aria-hidden="true">{src ? <img src={src} alt="" /> : label[0]?.toUpperCase() ?? "P"}</span>;
}

function AccountSwitcher({ user, workspaces, activeWorkspace, onSelect, mode, onMode, name, onName }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const pro = mode === "pro";
  const identity = pro ? activeWorkspace?.name ?? "Espace Pro" : name;
  const switcherRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOnOutsideClick = (event) => {
      if (!switcherRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [open]);

  return (
    <div className="dx-acct" ref={switcherRef}>
      <button
        className="dx-chip"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => { setDraft(name); setOpen((value) => !value); }}
      >
        <Av src={pro ? null : user?.avatar} label={identity} />
        <span className="dx-copy">
          <strong>{identity}</strong>
          <small>{pro && activeWorkspace ? `Pro, ${({ owner: "propriétaire", admin: "admin", member: "membre", viewer: "lecteur" })[activeWorkspace?.role] ?? "membre"}` : pro ? "Aucune équipe sélectionnée" : "Personnel"}</small>
        </span>
        <span className={`dx-chev ${open ? "is-open" : ""}`} aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="dx-menu" role="menu" aria-label="Changer de compte">
          <p className="dx-ml">Compte personnel</p>
          <button className={`dx-opt ${!pro ? "is-active" : ""}`} type="button" role="menuitem" onClick={() => { onMode("perso"); setOpen(false); }}>
            <Av sm src={user?.avatar} label={name} />
            <span className="dx-copy"><strong>{name}</strong><small>Personnel</small></span>
            {!pro && <span className="dx-ck" aria-label="Compte actif">✓</span>}
          </button>
          <p className="dx-ml">Espaces Pro</p>
          {workspaces.length === 0 ? (
            <div className="dx-empty">Aucun espace disponible</div>
          ) : workspaces.map((workspace) => {
            const on = pro && activeWorkspace?.id === workspace.id;
            return (
              <button className={`dx-opt ${on ? "is-active" : ""}`} type="button" role="menuitem" key={workspace.id}
                onClick={() => { onSelect(workspace); onMode("pro"); setOpen(false); }}>
                <Av sm label={workspace.name} />
                <span className="dx-copy"><strong>{workspace.name}</strong><small>{workspace.role === "owner" ? "Propriétaire" : workspace.role}</small></span>
                {on && <span className="dx-ck" aria-label="Espace actif">✓</span>}
              </button>
            );
          })}
          {pro ? (
            <a className="dx-mf" href="#teams" onClick={() => setOpen(false)}>Créer un espace ou inviter, dans Équipes</a>
          ) : (
            <form className="dx-prof" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onName(draft.trim()); setOpen(false); } }}>
              <label htmlFor="pseudo">Pseudo ou prénom</label>
              <input id="pseudo" value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} />
              <button className="dx-btn primary" type="submit" disabled={!draft.trim() || draft.trim() === name}>Enregistrer</button>
            </form>
          )}
          <div className="dx-mf">{user?.email ?? "Compte administrateur"}</div>
        </div>
      )}
    </div>
  );
}

function Intro({ fallback, onDone }) {
  const [name, setName] = useState("");
  return (
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-t" onKeyDown={(e) => { if (e.key === "Escape") onDone(fallback); }}>
      <form className="intro-card" onSubmit={(e) => { e.preventDefault(); onDone(name.trim() || fallback); }}>
        <h2 id="intro-t">Comment dois-je t'appeler ?</h2>
        <p>Ce pseudo ou prénom s'affiche dans ton espace Personnel. L'espace Pro garde le nom de ton équipe.</p>
        <input aria-label="Pseudo ou prénom" placeholder="Pseudo ou prénom" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="intro-act">
          <button className="dx-btn" type="button" onClick={() => onDone(fallback)}>Passer</button>
          <button className="dx-btn primary" type="submit" disabled={!name.trim()}>Continuer</button>
        </div>
      </form>
    </div>
  );
}

const store = (key, value) => { try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ } };
const stored = (key) => { try { return localStorage.getItem(key); } catch { return null; } };

// StrictMode (et deux onglets rapides) lancent le chargement deux fois: une seule création par session.
const firstWorkspace = new Map();
function createFirstWorkspace(token, headers) {
  if (!firstWorkspace.has(token)) {
    firstWorkspace.set(token, fetch(`${API_URL}/api/v1/workspaces`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Paranoïa Studio" }) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((ws) => { if (!ws) firstWorkspace.delete(token); return ws; }));
  }
  return firstWorkspace.get(token);
}

function Dashboard({ token, onLogout, theme, onTheme, onToggleTheme }) {
  const accent = ACCENT;
  const [calm, setCalm] = useState(() => stored("paranoia_calm") === "1");
  const [user, setUser] = useState(null);
  const [apiState, setApiState] = useState("Vérification...");
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("paranoia_mode") === "pro" ? "pro" : "perso"; } catch { return "perso"; } });
  const [profile, setProfile] = useState(() => { try { return JSON.parse(localStorage.getItem("paranoia_profile") ?? "null"); } catch { return null; } });
  const [page, setPage] = useState(() => window.location.hash.slice(1) || "overview");
  const [refreshKey, setRefreshKey] = useState(0);
  const [searching, setSearching] = useState(false);
  const [seed, setSeed] = useState(""); // ce que tu as tapé dans le champ de la barre, repris par la palette
  const [notes, setNotes] = useState([]);
  const [allTasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("paranoia_active_workspace") ?? "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_URL}/api/v1/me`, { headers }),
      fetch(`${API_URL}/api/v1/status`),
      fetch(`${API_URL}/api/v1/notes?limit=50`, { headers }),
      fetch(`${API_URL}/api/v1/tasks?limit=50`, { headers }),
      fetch(`${API_URL}/api/v1/workspaces`, { headers }),
      fetch(`${API_URL}/api/v1/events`, { headers }),
    ])
      .then(async ([meResponse, statusResponse, notesResponse, tasksResponse, workspacesResponse, eventsResponse]) => {
        if (!meResponse.ok) {
          onLogout();
          return;
        }
        const [me, status, notes, tasks, workspaces, events] = await Promise.all([
          meResponse.json(),
          statusResponse.json(),
          notesResponse.json(),
          tasksResponse.json(),
          workspacesResponse.ok ? workspacesResponse.json() : [],
          eventsResponse.ok ? eventsResponse.json() : [],
        ]);
        setUser(me);
        setApiState(status.service ?? "En ligne");
        setNotes(notes.items ?? []);
        setTasks(tasks.items ?? []);
        setEvents(events);
        // Chaque compte a au moins un espace Pro: on le crée au premier chargement.
        let ws = workspaces;
        if (ws.length === 0) {
          const created = await createFirstWorkspace(token, headers);
          if (created?.id) ws = [created];
        }
        const availableWorkspaces = ws.length > 0
          ? ws
          : [{ id: "local-account", name: "Paranoïa Studio", role: "owner" }];
        setWorkspaces(availableWorkspaces);
        setActiveWorkspace((current) => {
          const next = availableWorkspaces.find((workspace) => workspace.id === current?.id) ?? availableWorkspaces[0];
          if (next) localStorage.setItem("paranoia_active_workspace", JSON.stringify(next));
          return next;
        });
        setIsLoading(false);
      })
      .catch(() => {
        setApiState("Indisponible");
        setIsLoading(false);
      });
  }, [onLogout, refreshKey, token]);

  useEffect(() => {
    const handleHashChange = () => setPage(window.location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearching((v) => !v); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Personnel = tâches privées; Pro = tâches de l'équipe ouverte. Tout le reste de l'interface ne voit que celles-ci.
  const modeTasks = mode === "pro" ? allTasks.filter((t) => t.workspace_id && t.workspace_id === activeWorkspace?.id) : allTasks.filter((t) => !t.workspace_id);
  const ready = !isLoading;
  const refresh = () => setRefreshKey((value) => value + 1);
  const TITLES = { pro: "Espace Pro", mail: "Mail", overview: "Vue d'ensemble", notes: "Notes", tasks: "Tâches", calendar: "Calendrier", system: "Système", settings: "Paramètres", goals: "Objectifs", projects: "Projets", habits: "Habitudes", focus: "Focus", resources: "Ressources", teams: "Équipes", activity: "Activité", audit: "Audit" };
  const LOCAL = {
    goals: { title: "Objectifs", intro: "Fixe un cap et fais-le avancer de colonne en colonne", label: "Objectif" },
    projects: { title: "Projets", intro: "Suis chaque projet de l'idée à la livraison", label: "Projet" },
  };
  useEffect(() => { document.title = `${TITLES[page] ?? TITLES.overview} · Paranoïa One`; }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  const activityRows = [...(mode === "pro" ? [] : notes.map((n) => ["Note", n])), ...modeTasks.map((t) => ["Tâche", t]), ...(mode === "pro" ? [] : events.map((e) => ["Événement", e]))]
    .map(([kind, x]) => ({ key: kind + x.id, title: x.title, tag: kind, at: x.updated_at ?? x.created_at ?? "" }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 20)
    .map((x) => ({ ...x, sub: x.at ? new Date(x.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "" }));
  const NAV = mode === "pro" ? [
    ["Pro", [["pro", "Vue d’ensemble"], ["mail", "Mail"], ["projects", "Projets"], ["tasks", "Tâches"], ["resources", "Ressources"], ["teams", "Équipes"], ["activity", "Activité"]]],
    ...(user?.is_admin ? [["Administration", [["audit", "Audit"]]]] : []),
    ["Compte", [["settings", "Paramètres"], ["system", "Système"]]],
  ] : [
    ["Personnel", [["overview", "Vue d'ensemble"], ["calendar", "Calendrier"], ["notes", "Notes"], ["tasks", "Tâches"], ["goals", "Objectifs"], ["habits", "Habitudes"], ["focus", "Focus"]]],
    ["Compte", [["settings", "Paramètres"], ["system", "Système"]]],
  ];
  const library = usePageLibrary(mode, page, NAV);
  const [navigationOpen, setNavigationOpen] = useState(false);
  useEffect(() => { setNavigationOpen(false); }, [page, mode]);
  useEffect(() => {
    if (!navigationOpen) return;
    const media = window.matchMedia("(max-width: 760px)");
    if (!media.matches) return;
    const panel = document.getElementById("workspace-navigation");
    const content = document.querySelector(".dx-wrap");
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    content.inert = true;
    panel.querySelector("button")?.focus();
    const closeOnResize = () => { if (!media.matches) setNavigationOpen(false); };
    media.addEventListener("change", closeOnResize);
    return () => {
      document.body.style.overflow = overflow;
      content.inert = false;
      media.removeEventListener("change", closeOnResize);
      previous?.focus();
    };
  }, [navigationOpen]);
  function switchMode(next) {
    setMode(next);
    setPage(next === "pro" ? "pro" : "overview");
    try { localStorage.setItem("paranoia_mode", next); } catch { /* stockage indisponible */ }
    window.location.hash = next === "pro" ? "pro" : "overview";
  }
  // Les liens de notification ("tasks:<équipe>", "teams") mènent côté Pro, dans l'équipe concernée.
  function openLink(link) {
    const [target, workspaceId] = link.split(":");
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (workspace) selectWorkspace(workspace);
    const next = target === "calendar" ? "perso" : "pro"; // le calendrier n'existe qu'en mode perso
    setMode(next);
    try { localStorage.setItem("paranoia_mode", next); } catch { /* stockage indisponible */ }
    window.location.hash = target || "tasks";
  }
  const fallbackName = user?.email?.split("@")[0] ?? "Moi";
  const name = user?.display_name || profile?.name || fallbackName;
  const saveName = (n) => {
    setProfile({ name: n });
    try { localStorage.setItem("paranoia_profile", JSON.stringify({ name: n })); } catch { /* stockage indisponible */ }
    updateProfile({ display_name: n }).catch(() => {}); // le pseudo local reste la référence si l'API refuse
  };
  const updateProfile = (patch) => saveProfile(API_URL, token, user, patch).then((saved) => setUser((u) => ({ ...u, ...saved })));
  const selectWorkspace = (workspace) => {
    setActiveWorkspace(workspace);
    try { localStorage.setItem("paranoia_active_workspace", JSON.stringify(workspace)); } catch { /* stockage indisponible */ }
  };
  const common = { token, api: API_URL, onRefresh: refresh };
  let view;
  if (!ready) {
    view = <div className="dx-skel" aria-busy="true" aria-label="Chargement" />;
  } else if (page === "pro" && mode === "pro") {
    view = <ProOverview workspace={activeWorkspace} tasks={modeTasks} apiState={apiState} />;
  } else if (LOCAL[page]) {
    view = <KanbanPage key={page + mode} id={`${page}_${mode}`} {...LOCAL[page]} />;
  } else {
    view = {
      mail: <MailPage {...common} user={user} workspace={activeWorkspace} />,
      notes: <NotesPage {...common} notes={notes} />,
      tasks: <TasksPage {...common} tasks={modeTasks} workspace={mode === "pro" ? activeWorkspace ?? { id: "local-account" } : undefined} />,
      calendar: <CalendarPage {...common} events={events} />,
      habits: <HabitsPage key={mode} id={`habits_${mode}`} />,
      resources: <ResourcesPage key={mode} id={`resources_${mode}`} />,
      focus: <FocusPage />,
      teams: <TeamsPage {...common} workspaces={workspaces} activeWorkspace={activeWorkspace} onSelect={selectWorkspace} />,
      activity: <ListPage title="Activité" intro="Les derniers changements, toutes pages confondues" emptyTitle="Aucune activité" rows={activityRows} />,
      settings: <SettingsPage api={API_URL} token={token} user={user} onUser={(p) => setUser((u) => ({ ...u, ...p }))} onProfile={updateProfile} name={name} onName={saveName} theme={theme} onTheme={onTheme}
        calm={calm} onCalm={(v) => { setCalm(v); store("paranoia_calm", v ? "1" : "0"); }} />,
      audit: <AuditPage api={API_URL} token={token} user={user} />,
      system: <SystemPage api={API_URL} token={token} apiState={apiState} user={user} workspaces={workspaces} />,
    }[page] ?? <OverviewPage {...common} name={name} notes={notes} tasks={modeTasks} events={events} />;
  }
  return (
    <div className={`dx theme-${theme}${calm ? " calm" : ""}`} data-mode={mode} data-page={page} data-navigation-open={navigationOpen} style={{ "--h": accent }}>
      <a className="skip-link" href="#contenu" onClick={(e) => { e.preventDefault(); document.getElementById("contenu")?.focus(); }}>Aller au contenu</a>
      <aside className="dx-side" id="workspace-navigation" onClick={(event) => { if (event.target.closest("a.dx-nav")) setNavigationOpen(false); }} onKeyDown={(event) => {
        if (event.key === "Escape") setNavigationOpen(false);
        if (event.key !== "Tab" || !navigationOpen) return;
        const controls = [...event.currentTarget.querySelectorAll('a[href], button, summary, input')].filter((el) => !el.disabled && el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <button className="notebook-close dx-iconbtn" type="button" aria-label="Fermer la navigation" onClick={() => setNavigationOpen(false)}>×</button>
        <div className="dx-brand">
          <div className="dx-mark" aria-hidden="true">P</div>
          <div><b>Paranoïa One</b><small>{mode === "pro" ? activeWorkspace?.name ?? "Espace Pro" : name}</small></div>
        </div>
        <div className="workspace-modes" role="group" aria-label="Type d’espace">
          <button type="button" aria-pressed={mode === "perso"} onClick={() => mode !== "perso" && switchMode("perso")}>Personnel</button>
          <button type="button" aria-pressed={mode === "pro"} onClick={() => mode !== "pro" && switchMode("pro")}>Pro</button>
        </div>
        <button className="nav-search" type="button" onClick={() => { setSeed(""); setSearching(true); }}><span aria-hidden="true">⌕</span> Rechercher <kbd>Ctrl K</kbd></button>
        <NotebookNavigation navigation={NAV} favorites={library.favorites} page={page} />
        <div className="dx-who">
          <Av sm src={user?.avatar} label={user?.email ?? "P"} />
          <span className="dx-copy"><small>{user?.email ?? "Compte administrateur"}</small></span>
          <button className="dx-out" type="button" onClick={onLogout}>Quitter</button>
        </div>
      </aside>

      <div className="dx-wrap">
        <div className="dx-top">
          <button className="dx-iconbtn notebook-menu" type="button" aria-label="Navigation" aria-controls="workspace-navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(!navigationOpen)}>☰</button>
          <div className="workspace-path"><span>{mode === "pro" ? "Espace de travail" : "Personnel"}</span><span aria-hidden="true">/</span><strong>{NAV.flatMap(([, links]) => links).find(([id]) => id === page)?.[1] ?? TITLES[page] ?? "Vue d’ensemble"}</strong></div>
          <div className="dx-act">
            <button className="dx-iconbtn page-star" type="button" aria-label={library.starred ? "Retirer des favoris" : "Ajouter aux favoris"} aria-pressed={library.starred} onClick={library.toggle}>{library.starred ? "★" : "☆"}</button>
            <button className="dx-iconbtn mobile-search" type="button" aria-label="Rechercher" onClick={() => setSearching(true)}>⌕</button>
            <Bell api={API_URL} token={token} onOpen={openLink} />
            <button className="dx-btn workspace-theme" type="button" aria-label={theme === "dark" ? "Passer au mode clair" : "Passer au mode sombre"} onClick={onToggleTheme}><span className="workspace-theme-icon" aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span><span className="workspace-theme-label">{theme === "dark" ? "Mode clair" : "Mode sombre"}</span></button>
            <AccountSwitcher
              user={user}
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              onSelect={selectWorkspace}
              mode={mode}
              onMode={(next) => next !== mode && switchMode(next)}
              name={name}
              onName={saveName}
            />
          </div>
        </div>
        <main className="dx-main" id="contenu" tabIndex={-1}>{(page === "overview" || page === "pro") && <RecentPages pages={library.recent} />}{view}</main>
      </div>
      <SearchPalette open={searching} initial={seed} onClose={() => { setSearching(false); setSeed(""); }} nav={NAV} mode={mode} notes={notes} tasks={modeTasks} events={events} />
      {ready && user && !profile && !user.display_name && <Intro fallback={fallbackName} onDone={saveName} />}
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("paranoia_session_token") || (location.pathname === "/login" ? null : "dev-local-token")); // TEMP: connexion désactivée (retirer ce fallback pour la rétablir)
  const [theme, setThemeState] = useState(() => (stored("paranoia_theme") === "light" ? "light" : "dark"));
  const setTheme = (next) => { setThemeState(next); store("paranoia_theme", next); };

  const logout = useCallback(() => {
    const currentToken = localStorage.getItem("paranoia_session_token");
    if (currentToken) {
      fetch(`${API_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${currentToken}` },
      }).catch(() => {});
    }
    localStorage.removeItem("paranoia_session_token");
    setToken(null);
  }, []);

  return token ? (
    <Dashboard
      token={token}
      onLogout={logout}
      theme={theme}
      onTheme={setTheme}
      onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
    />
  ) : (
    <Login />
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
