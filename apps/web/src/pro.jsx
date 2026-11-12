import { Icon } from "./icons";
import { useLocalList } from "./local";
import { PageHead } from "./ui";

const destinations = [
  ["mail", "Mail", "Boîte officielle support@paranoiastudio.fr."],
  ["projects", "Projets", "Organiser les livrables et suivre leur avancement."],
  ["tasks", "Tâches d’équipe", "Répartir le travail et suivre les échéances."],
  ["resources", "Ressources", "Retrouver les liens et références du travail."],
  ["teams", "Équipes", "Gérer les espaces, les membres et les invitations."],
];

export function ProOverview({ workspace, tasks, apiState }) {
  const [projects] = useLocalList("projects_pro");
  const real = workspace && workspace.id !== "local-account";
  const open = tasks.filter((task) => task.status !== "done" && task.status !== "cancelled");
  const inProgress = open.filter((task) => task.status === "in_progress");
  return (
    <section className="page-view pro-overview">
      <PageHead title={real ? workspace.name : "Espace Pro"} sub="Les projets, les personnes et le travail à faire, au même endroit.">
        <a className="dx-btn primary" href="#teams"><Icon id="teams" />{real ? "Gérer l’équipe" : "Créer une équipe"}</a>
      </PageHead>
      {apiState === "Indisponible" && <p className="pro-connection" role="status">La connexion aux données d’équipe est indisponible. Les projets et ressources enregistrés sur cet appareil restent accessibles.</p>}
      <nav className="pro-metrics" aria-label="Suivi de l’espace Pro">
        <a href="#projects"><span>Projets sur cet appareil</span><b>{projects.length}</b><small>Ouvrir le tableau ↗</small></a>
        <a href="#tasks"><span>Tâches ouvertes</span><b>{real ? open.length : "—"}</b><small>{real ? "Dans l’équipe sélectionnée" : "Sélectionnez une équipe"}</small></a>
        <a href="#tasks"><span>En cours</span><b>{real ? inProgress.length : "—"}</b><small>{real ? "Travail démarré" : "Sélectionnez une équipe"}</small></a>
      </nav>
      <div className="pro-layout">
        <section className="pro-work">
          <div className="section-heading"><h2>Espaces de travail</h2><span className="pro-caption">Accès rapide</span></div>
          <div className="pro-destinations">{destinations.map(([id, title, description]) => <a href={`#${id}`} key={id}><span className="pro-destination-icon"><Icon id={id} size={20} /></span><div><h3>{title}</h3><p>{description}</p></div><span aria-hidden="true">↗</span></a>)}</div>
          <div className="section-heading pro-task-heading"><h2>Travail en cours <span>{inProgress.length}</span></h2><a href="#tasks">Toutes les tâches ↗</a></div>
          {inProgress.length ? <ul className="pro-task-list">{inProgress.slice(0, 6).map((task) => <li key={task.id}><Icon id="tasks" /><a href="#tasks">{task.title}</a><span>{task.due_date?.slice(0, 10) || "Sans échéance"}</span></li>)}</ul> : <div className="pro-empty"><Icon id="tasks" size={26} /><h3>{real ? "Prêt pour la prochaine étape" : "Votre équipe commence ici"}</h3><p>{real ? "Les tâches démarrées dans cette équipe apparaîtront ici." : "Créez ou sélectionnez une équipe pour retrouver les tâches partagées."}</p><a className="dx-btn" href={real ? "#tasks" : "#teams"}>{real ? "Voir les tâches" : "Ouvrir Équipes"}</a></div>}
        </section>
        <aside className="pro-rail">
          <span className="pro-space-icon"><Icon id="teams" size={24} /></span>
          <h2>{real ? workspace.name : "Un espace commun"}</h2>
          <p>{real ? "Retrouvez les membres et les accès de l’équipe sélectionnée." : "Invitez vos collaborateurs et répartissez le travail dans une équipe."}</p>
          <a href="#teams">Membres et invitations →</a>
          <div className="pro-rail-section"><h3>Derniers changements</h3><p>Consultez les modifications des tâches de l’équipe.</p><a href="#activity">Voir l’activité →</a></div>
          <div className="pro-rail-section"><h3>Stockage local</h3><p>Les tableaux de projets et les ressources sont actuellement conservés dans ce navigateur.</p></div>
        </aside>
      </div>
    </section>
  );
}
