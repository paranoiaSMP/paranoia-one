// En-tête unique d'une page: titre, contexte, action principale.
export function PageHead({ title, sub, children }) {
  return (
    <header className="pg-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="pg-act">{children}</div>}
    </header>
  );
}

export const Empty = ({ title, hint }) => (
  <div className="page-empty"><svg className="empty-mark" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="8" y="7" width="24" height="27" rx="5" stroke="currentColor"/><path d="M14 15h12M14 21h8M14 27h5" stroke="currentColor" strokeLinecap="round"/></svg><strong>{title}</strong>{hint && <span>{hint}</span>}</div>
);

export const PRIO = { high: ["Haute", 3], normal: ["Normale", 2], low: ["Basse", 1] };
