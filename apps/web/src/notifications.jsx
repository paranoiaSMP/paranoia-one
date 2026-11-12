import { useEffect, useRef, useState } from "react";
import { request } from "./views";

const WHEN = (d) => new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function BellGlyph({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4M12 2V1" /></svg>;
}

/* Cloche du bandeau: le serveur reste la source de vérité, on l'interroge toutes les minutes (pas de push). */
export function Bell({ api, token, onOpen }) {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  // L'heure locale part avec la requête: c'est elle qui déclenche les rappels d'événements (ils n'ont pas de fuseau).
  const load = () => request(api, token, "GET", `/notifications?now=${encodeURIComponent(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16))}`).then((result) => { setData(result); setError(false); }).catch(() => setError(true)).finally(() => setLoading(false));
  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => clearInterval(id);
  }, [api, token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const readAll = () => request(api, token, "POST", "/notifications/read").then(load).catch(() => {});
  const go = (n) => { setOpen(false); if (!n.read) readAll(); onOpen(n.link); };
  return (
    <div className="bell" ref={box}>
      <button className="dx-iconbtn bell-btn" type="button" aria-expanded={open} aria-haspopup="dialog"
        aria-label={data.unread ? `Notifications, ${data.unread} non lue${data.unread > 1 ? "s" : ""}` : "Notifications"}
        onClick={() => { setOpen(!open); if (!open) load(); }}>
        <BellGlyph />{data.unread > 0 && <span className="bell-n">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open && (
        <div className="bell-pop" role="dialog" aria-label="Notifications">
          <div className="bell-h">
            <div><b>Notifications</b><span className="bell-subtitle">{data.unread ? `${data.unread} non lue${data.unread > 1 ? "s" : ""}` : "Votre boîte de réception"}</span></div>
            <button className="bell-close" type="button" aria-label="Fermer les notifications" onClick={() => setOpen(false)}>×</button>
          </div>
          {data.items.length === 0 ? <div className="bell-empty"><span className="bell-empty-icon"><BellGlyph size={24} /></span><strong>{loading ? "Chargement…" : error ? "Connexion indisponible" : "Vous êtes à jour"}</strong><p>{error ? "Les notifications n’ont pas pu être chargées." : "Vos mentions, invitations et rappels apparaîtront ici."}</p>{error && <button className="dx-btn" type="button" onClick={() => { setLoading(true); setError(false); load(); }}>Réessayer</button>}</div> : (
            <ul>
              {data.items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={n.read ? "" : "is-new"} onClick={() => go(n)}>
                    <span>{n.text}</span><small>{WHEN(n.created_at)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data.items.length > 0 && <footer className="bell-footer"><button type="button" disabled={!data.unread} onClick={readAll}>Tout marquer comme lu</button></footer>}
        </div>
      )}
    </div>
  );
}
