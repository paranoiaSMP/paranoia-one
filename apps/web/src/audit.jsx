import { useEffect, useState } from "react";
import { PageHead, Empty } from "./ui";
import { request } from "./views";

const when = (s) => (s ? new Date(`${s.slice(0, 10)}T${s.slice(11, 19)}Z`).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "jamais");
const STATUS = { actif: "Actif", revoque: "Révoqué", a_supprimer: "Suppression demandée", supprime: "Supprimé" };
const ACTIONS = {
  "auth.login": "Connexion", "auth.login_failed": "Connexion échouée", "auth.logout": "Déconnexion", "auth.register": "Inscription",
  "account.created": "Compte créé", "account.profile_updated": "Profil modifié", "account.email_changed": "Email modifié", "account.password_changed": "Mot de passe modifié",
  "session.revoked": "Session révoquée", "session.revoked_others": "Autres sessions révoquées",
  "note.deleted": "Note supprimée", "task.deleted": "Tâche supprimée",
  "workspace.created": "Équipe créée", "workspace.invited": "Invitation envoyée", "workspace.invitation_accepted": "Invitation acceptée",
  "launcher.install_created": "Installation créée", "launcher.revoked": "Launcher révoqué", "launcher.reactivated": "Launcher réactivé",
  "launcher.delete_ordered": "Suppression ordonnée", "launcher.deleted": "Launcher supprimé", "launcher.incident": "Incident signalé",
  "launcher.revoked_auto": "Révoqué automatiquement", "launcher.hash_changed": "Binaire modifié",
};
const FILTERS = [["", "Tout"], ["auth.", "Connexions"], ["account.", "Comptes"], ["session.", "Sessions"], ["workspace.", "Équipes"], ["launcher.", "Launcher"]];
const PAGE = 50;

function Installs({ api, token }) {
  const [list, setList] = useState(null);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState(null);
  const [error, setError] = useState("");
  const load = () => request(api, token, "GET", "/admin/launcher/installs").then(setList).catch((x) => setError(x.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn) => { try { setError(""); await fn(); await load(); } catch (x) { setError(x.message); } };
  const create = (e) => { e.preventDefault(); act(async () => { setFresh(await request(api, token, "POST", "/admin/launcher/installs", { label: label.trim() })); setLabel(""); }); };
  const order = (i, op, ask) => { if (!ask || window.confirm(ask)) act(() => request(api, token, "POST", `/admin/launcher/installs/${i.id}/${op}`)); };
  return (
    <>
      <h2 className="sub-h">Installations du launcher <small>{list?.length ?? ""}</small></h2>
      <form className="quick" onSubmit={create}>
        <input aria-label="Nom de l'installation" placeholder="Nom de l'installation, par exemple PC de Leo" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        <button className="dx-btn primary" type="submit" disabled={!label.trim()}>Créer</button>
      </form>
      {fresh && (
        <div className="inline-error" role="status">
          Jeton de « {fresh.install.label} », affiché une seule fois: <code className="mono">{fresh.token}</code>
          <button className="dx-btn ghost" type="button" onClick={() => navigator.clipboard?.writeText(fresh.token)}>Copier</button>
          <button className="dx-btn ghost" type="button" onClick={() => setFresh(null)}>Fermer</button>
        </div>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {list?.length === 0 && <Empty title="Aucune installation" hint="Crée un jeton pour relier un launcher à ce compte administrateur" />}
      <ul className="rows">
        {list?.map((i) => (
          <li className="row-item aud" key={i.id}>
            <div><b>{i.label}</b><small>{i.version ? `v${i.version} · ` : ""}vu {when(i.last_seen)}{i.last_ip ? ` · ${i.last_ip}` : ""}</small></div>
            <span className="tag">{STATUS[i.status] ?? i.status}</span>
            {i.status === "actif" && <button className="dx-btn" onClick={() => order(i, "revoke")}>Révoquer</button>}
            {i.status === "revoque" && <>
              <button className="dx-btn" onClick={() => order(i, "reactivate")}>Réactiver</button>
              <button className="dx-btn" onClick={() => order(i, "delete-order", `Ordonner au launcher « ${i.label} » de supprimer ses propres fichiers à sa prochaine connexion ?`)}>Ordonner la suppression</button>
            </>}
          </li>
        ))}
      </ul>
    </>
  );
}

function Journal({ api, token }) {
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const fetchPage = (before) => request(api, token, "GET", `/admin/audit?limit=${PAGE}&action=${encodeURIComponent(filter)}${before ? `&before=${before}` : ""}`);
  useEffect(() => {
    setRows(null);
    fetchPage().then((r) => { setRows(r); setMore(r.length === PAGE); }).catch((x) => setError(x.message));
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadMore = () => fetchPage(rows.at(-1).id).then((r) => { setRows((p) => [...p, ...r]); setMore(r.length === PAGE); }).catch((x) => setError(x.message));
  return (
    <>
      <h2 className="sub-h">Journal</h2>
      <div className="seg aud-seg" role="group" aria-label="Filtrer le journal">
        {FILTERS.map(([v, l]) => <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {rows?.length === 0 && <Empty title="Aucune entrée" />}
      <ul className="rows">
        {rows?.map((e) => (
          <li className="row-item aud" key={e.id}>
            <div>
              <b>{ACTIONS[e.action] ?? e.action}</b>
              <small>{e.actor}{e.target ? ` · ${e.target}` : ""}{e.detail ? ` · ${e.detail}` : ""}</small>
            </div>
            <span className="tag mono">{e.ip ?? "—"}</span>
            <time className="mono" dateTime={e.at}>{when(e.at)}</time>
          </li>
        ))}
      </ul>
      {more && <button className="dx-btn" onClick={loadMore}>Charger plus</button>}
    </>
  );
}

export function AuditPage({ api, token, user }) {
  if (!user?.is_admin) return <section className="page-view"><PageHead title="Audit" /><Empty title="Accès réservé" hint="Cette page est réservée aux administrateurs" /></section>;
  return (
    <section className="page-view">
      <PageHead title="Audit" sub="Qui a fait quoi, et l'état des launchers installés. Le journal ne peut ni être modifié ni être effacé" />
      <Installs api={api} token={token} />
      <Journal api={api} token={token} />
    </section>
  );
}
