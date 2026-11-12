import { useEffect, useState } from "react";
import { Icon } from "./icons";

function readList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch { return []; }
}

export function usePageLibrary(scope, page, navigation) {
  const [library, setLibrary] = useState(() => ({
    favorites: readList("paranoia_favorites"),
    recent: readList("paranoia_recent_pages"),
  }));
  const current = `${scope}/${page}`;
  const links = navigation.flatMap(([, items]) => items);
  const known = links.some(([id]) => id === page);
  useEffect(() => {
    if (!known) return;
    setLibrary((previous) => {
      const recent = [current, ...previous.recent.filter((item) => item !== current)].slice(0, 24);
      try { localStorage.setItem("paranoia_recent_pages", JSON.stringify(recent)); } catch { /* Session state remains usable. */ }
      return { ...previous, recent };
    });
  }, [current, known]);
  const toggle = () => setLibrary((previous) => {
    const favorites = previous.favorites.includes(current)
      ? previous.favorites.filter((item) => item !== current)
      : [...previous.favorites, current];
    try { localStorage.setItem("paranoia_favorites", JSON.stringify(favorites)); } catch { /* Session state remains usable. */ }
    return { ...previous, favorites };
  });
  const resolve = (items) => items.flatMap((item) => {
    const [itemScope, id] = item.split("/");
    const link = links.find(([key]) => key === id);
    return itemScope === scope && link ? [link] : [];
  });
  return { favorites: resolve(library.favorites), recent: resolve(library.recent).filter(([id]) => id !== page).slice(0, 4), starred: library.favorites.includes(current), toggle };
}

export function PageLink({ id, label, page }) {
  return <a className="dx-nav" href={`#${id}`} aria-current={page === id ? "page" : undefined}><span className="dx-ico"><Icon id={id === "pro" ? "overview" : id} size={16} /></span><span>{label}</span></a>;
}

export function NotebookNavigation({ navigation, favorites, page }) {
  return <div className="notebook-navigation">
    <section className="notebook-favorites" aria-label="Favoris"><h2>Favoris</h2>{favorites.length ? favorites.map(([id, label]) => <PageLink key={id} id={id} label={label} page={page} />) : <p>Ajoutez une page avec l’étoile dans son en-tête.</p>}</section>
    {navigation.map(([group, links]) => <details className="notebook-group" key={group} open><summary>{group === "Pro" ? "Espace d’équipe" : group === "Personnel" ? "Pages personnelles" : group}</summary><nav aria-label={group}>{links.map(([id, label]) => <PageLink key={id} id={id} label={label} page={page} />)}</nav></details>)}
  </div>;
}

export function RecentPages({ pages }) {
  if (!pages.length) return null;
  return <section className="recent-pages" aria-label="Pages récentes"><h2>Récemment ouvertes</h2><div>{pages.map(([id, label]) => <a key={id} href={`#${id}`}><Icon id={id === "pro" ? "overview" : id} size={18} /><span>{label}</span><span aria-hidden="true">↗</span></a>)}</div></section>;
}
