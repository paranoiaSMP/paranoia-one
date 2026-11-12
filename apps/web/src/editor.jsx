import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./icons";

/* Éditeur par blocs complet façon Notion :
   - Blocs de base : Paragraphe, H1, H2, H3, Séparateur
   - Listes : Puces, Numérotée (1., 2., 3. séquentiels), À cocher (Todo)
   - Médias & Style : Encadré (Callout avec icône), Bloc de code (avec choix de langage & copie rapide), Citation, Volet déroulant (Toggle)
   - Menu Slash « / » catégorisé avec navigation clavier
   - Menu contextuel sur le poignet de bloc « ⠿ » (Dupliquer, Supprimer, Transformer en, Déplacer)
   - Raccourcis Markdown à la volée (#, ##, ###, -, *, 1., [], >, ```)
   - Sérialisation transparente en Markdown compatible.
*/

const uid = () => crypto.randomUUID();

export const PRE = {
  h1: "# ",
  h2: "## ",
  h3: "### ",
  ul: "- ",
  ol: "1. ",
  quote: "> ",
  callout: "> [icon:bulb] ",
  code: "```js ",
  toggle: "▶ ",
};

export const SHORT = {
  "#": "h1",
  "##": "h2",
  "###": "h3",
  "-": "ul",
  "*": "ul",
  "1.": "ol",
  "1": "ol",
  "[]": "todo",
  ">": "quote",
  "```": "code",
  "::": "callout",
};

export const ITEMS = [
  { type: "p", label: "Texte ordinaire", desc: "Paragraphe de texte classique", iconId: "text", category: "Texte" },
  { type: "h1", label: "Titre 1", desc: "Grand titre de section", iconId: "h1", category: "Texte" },
  { type: "h2", label: "Titre 2", desc: "Titre de sous-section", iconId: "h2", category: "Texte" },
  { type: "h3", label: "Titre 3", desc: "Petit sous-titre", iconId: "h3", category: "Texte" },
  { type: "ul", label: "Liste à puces", desc: "Liste simple avec puces", iconId: "listUl", category: "Listes" },
  { type: "ol", label: "Liste numérotée", desc: "Liste ordonnée 1, 2, 3...", iconId: "listOl", category: "Listes" },
  { type: "todo", label: "Tâche à cocher", desc: "Suivre des choses à faire", iconId: "todo", category: "Listes" },
  { type: "toggle", label: "Volet déroulant (Toggle)", desc: "Contenu pliable / dépliable", iconId: "toggle", category: "Listes" },
  { type: "callout", label: "Encadré Callout", desc: "Mettre en avant une information", iconId: "bulb", category: "Style" },
  { type: "code", label: "Bloc de code", desc: "Extrait de code avec bouton Copier", iconId: "code", category: "Style" },
  { type: "quote", label: "Citation", desc: "Bloc de citation en retrait", iconId: "quote", category: "Style" },
  { type: "hr", label: "Séparateur", desc: "Ligne de séparation horizontale", iconId: "divider", category: "Texte" },
];

export const LANGS = ["javascript", "typescript", "html", "css", "rust", "python", "json", "sql", "bash", "markdown"];
export const CALLOUT_ICONS = ["bulb", "info", "warning", "star", "pin", "target", "code", "bolt", "rocket", "sparkle"];

const HINT = {
  h1: "Titre 1",
  h2: "Titre 2",
  h3: "Titre 3",
  ul: "Élément de liste",
  ol: "Élément numéroté",
  todo: "Tâche à cocher",
  quote: "Citation…",
  callout: "Écrivez une note importante ici…",
  code: "// Votre code ici…",
  toggle: "Titre du volet déroulant…",
  p: "Commencez à écrire ici, ou tapez « / » pour choisir un format…",
};

export function parse(text) {
  const out = String(text ?? "").split("\n").map((l) => {
    let m;
    if (l === "---") return { id: uid(), type: "hr", text: "" };
    if ((m = l.match(/^(#{1,3}) (.*)$/))) return { id: uid(), type: `h${m[1].length}`, text: m[2] };
    if ((m = l.match(/^[-*] (.*)$/))) return { id: uid(), type: "ul", text: m[1] };
    if ((m = l.match(/^\d+\. (.*)$/))) return { id: uid(), type: "ol", text: m[1] };
    if ((m = l.match(/^\[( |x)\] (.*)$/))) return { id: uid(), type: "todo", text: m[2], checked: m[1] === "x" };
    if ((m = l.match(/^> \[icon:([a-z0-9_-]+)\] (.*)$/i))) return { id: uid(), type: "callout", text: m[2], icon: m[1] };
    if ((m = l.match(/^> ([💡📌⚠️🚀ℹ️⭐🎯🔥✨🧠]) (.*)$/))) return { id: uid(), type: "callout", text: m[2], icon: "bulb" };
    if ((m = l.match(/^> 💡 (.*)$/))) return { id: uid(), type: "callout", text: m[1], icon: "bulb" };
    if ((m = l.match(/^> (.*)$/))) return { id: uid(), type: "quote", text: m[1] };
    if ((m = l.match(/^```(\w+)? ?(.*)$/))) return { id: uid(), type: "code", text: m[2] || "", lang: m[1] || "javascript" };
    if ((m = l.match(/^▶ (.*)$/))) return { id: uid(), type: "toggle", text: m[1], open: false };
    return { id: uid(), type: "p", text: l };
  });
  return out.length ? out : [{ id: uid(), type: "p", text: "" }];
}

export const serialize = (bs) => bs.map((b) => {
  if (b.type === "hr") return "---";
  if (b.type === "todo") return `[${b.checked ? "x" : " "}] ${b.text}`;
  if (b.type === "ol") return `1. ${b.text}`;
  if (b.type === "callout") return `> [icon:${b.icon || "bulb"}] ${b.text}`;
  if (b.type === "code") return `\`\`\`${b.lang || "javascript"} ${b.text}`;
  if (b.type === "toggle") return `▶ ${b.text}`;
  return (PRE[b.type] ?? "") + b.text;
}).join("\n");

const copyToClipboard = (text) => {
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
};

function Txt({ b, reg, isOnly, className = "bk-t", ...p }) {
  const el = useRef(null);
  useLayoutEffect(() => {
    const t = el.current;
    if (!t) return;
    t.style.height = "0";
    t.style.height = Math.max(28, t.scrollHeight) + "px";
  }, [b.text, b.type]);
  const placeholder = isOnly && !b.text && b.type === "p"
    ? "Commencez à écrire ici, ou tapez « / » pour insérer un bloc…"
    : HINT[b.type] || "Écrivez ici…";
  return (
    <textarea
      ref={(n) => { el.current = n; reg(b.id, n); }}
      rows={1}
      value={b.text}
      spellCheck
      placeholder={placeholder}
      className={className}
      {...p}
    />
  );
}

export function BlockEditor({ value, onChange }) {
  const [blocks, setBlocks] = useState(() => parse(value));
  const [menu, setMenu] = useState(null); // { id, q, sel }
  const [handleMenu, setHandleMenu] = useState(null); // { id, i }
  const [calloutPickerId, setCalloutPickerId] = useState(null);
  const [copiedCodeId, setCopiedCodeId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const refs = useRef({});
  const want = useRef(null);
  const reg = (id, n) => { if (n) refs.current[id] = n; else delete refs.current[id]; };

  useLayoutEffect(() => {
    if (!want.current) return;
    const { id, at } = want.current;
    want.current = null;
    const el = refs.current[id];
    if (!el) return;
    el.focus();
    const p = at ?? el.value?.length ?? 0;
    el.setSelectionRange?.(p, p);
  });

  useEffect(() => {
    const off = (e) => {
      if (!e.target.closest(".bk-handle-menu") && !e.target.closest(".bk-grip")) setHandleMenu(null);
      if (!e.target.closest(".bk-callout-picker") && !e.target.closest(".bk-callout-icon-btn")) setCalloutPickerId(null);
    };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, []);

  const commit = (next, focus) => {
    setBlocks(next);
    onChange(serialize(next));
    if (focus) want.current = focus;
  };

  const patch = (id, p, focus) => commit(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)), focus);
  const idx = (id) => blocks.findIndex((b) => b.id === id);
  const insertAfter = (id, nb, focus) => {
    const i = idx(id);
    commit([...blocks.slice(0, i + 1), nb, ...blocks.slice(i + 1)], focus);
  };

  const filteredSlashItems = (m) => {
    const q = (m?.q ?? "").toLowerCase();
    return ITEMS.filter((item) => item.label.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q) || item.type.includes(q));
  };

  const apply = (id, type) => {
    setMenu(null);
    setHandleMenu(null);
    if (type === "hr") {
      const n = { id: uid(), type: "p", text: "" };
      const i = idx(id);
      commit([...blocks.slice(0, i), { id: uid(), type: "hr", text: "" }, n, ...blocks.slice(i + 1)], { id: n.id, at: 0 });
    } else {
      const extras = type === "callout" ? { icon: "bulb" } : type === "code" ? { lang: "javascript" } : type === "toggle" ? { open: true } : {};
      patch(id, { type, text: "", checked: false, ...extras }, { id, at: 0 });
    }
  };

  const duplicateBlock = (id) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    const nb = { ...b, id: uid() };
    const i = idx(id);
    commit([...blocks.slice(0, i + 1), nb, ...blocks.slice(i + 1)], { id: nb.id, at: nb.text?.length ?? 0 });
    setHandleMenu(null);
  };

  const removeBlock = (id) => {
    if (blocks.length <= 1) {
      commit([{ id: uid(), type: "p", text: "" }], { id: 0, at: 0 });
    } else {
      const i = idx(id);
      const nextTarget = blocks[i + 1] ?? blocks[i - 1];
      commit(blocks.filter((x) => x.id !== id), nextTarget && { id: nextTarget.id });
    }
    setHandleMenu(null);
  };

  const moveBlock = (id, dir) => {
    const i = idx(id);
    const target = i + dir;
    if (target < 0 || target >= blocks.length) return;
    const copy = [...blocks];
    [copy[i], copy[target]] = [copy[target], copy[i]];
    commit(copy, { id });
    setHandleMenu(null);
  };

  const onText = (b, v) => {
    // Raccourcis markdown à la volée
    const m = b.type === "p" && v.match(/^(#{1,3}|[-*]|1\.|1|\[\]|>|```|::) /);
    if (m) {
      const raw = m[1];
      const targetType = SHORT[raw];
      if (targetType) {
        const textWithoutShortcut = v.slice(m[0].length);
        const extras = targetType === "callout" ? { icon: "bulb" } : targetType === "code" ? { lang: "javascript" } : {};
        patch(b.id, { type: targetType, text: textWithoutShortcut, ...extras }, { id: b.id, at: 0 });
        setMenu(null);
        return;
      }
    }
    patch(b.id, { text: v });
    setMenu(v.startsWith("/") && b.type === "p" ? { id: b.id, q: v.slice(1), sel: 0 } : null);
  };

  const onKey = (e, b, i) => {
    const el = e.currentTarget;
    const list = menu?.id === b.id ? filteredSlashItems(menu) : null;
    if (list) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = list.length || 1;
        setMenu({ ...menu, sel: (menu.sel + (e.key === "ArrowDown" ? 1 : n - 1)) % n });
        return;
      }
      if (e.key === "Escape") { setMenu(null); return; }
      if (e.key === "Enter" && list.length) {
        e.preventDefault();
        apply(b.id, list[Math.min(menu.sel, list.length - 1)].type);
        return;
      }
    }
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const isList = b.type === "ul" || b.type === "ol" || b.type === "todo";
      if (isList && b.text === "") {
        patch(b.id, { type: "p" }, { id: b.id, at: 0 });
        return;
      }
      const at = el.selectionStart;
      const keepType = isList ? b.type : "p";
      const nb = { id: uid(), type: keepType, text: b.text.slice(at), checked: false };
      commit([...blocks.slice(0, i + 1), nb, ...blocks.slice(i + 1)], { id: nb.id, at: 0 });
    } else if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (b.type !== "p") {
        e.preventDefault();
        patch(b.id, { type: "p" }, { id: b.id, at: 0 });
        return;
      }
      if (i === 0) return;
      e.preventDefault();
      const prev = blocks[i - 1];
      if (prev.type === "hr") {
        commit(blocks.filter((x) => x.id !== prev.id), { id: b.id, at: 0 });
      } else {
        commit(blocks.filter((x) => x.id !== b.id).map((x) => (x.id === prev.id ? { ...x, text: x.text + b.text } : x)), { id: prev.id, at: prev.text.length });
      }
    } else if (e.key === "ArrowUp" && el.selectionStart === 0 && i > 0) {
      e.preventDefault(); want.current = { id: blocks[i - 1].id }; setBlocks([...blocks]);
    } else if (e.key === "ArrowDown" && el.selectionEnd === el.value.length && i < blocks.length - 1) {
      e.preventDefault(); want.current = { id: blocks[i + 1].id, at: 0 }; setBlocks([...blocks]);
    }
  };

  const dropOn = (id) => {
    const from = blocks.find((b) => b.id === drag);
    setDrag(null); setOver(null);
    if (!from || from.id === id) return;
    const rest = blocks.filter((b) => b.id !== from.id);
    const at = rest.findIndex((b) => b.id === id);
    commit([...rest.slice(0, at), from, ...rest.slice(at)]);
  };

  let olCounter = 0;

  return (
    <div className="bk-container">
      <div className="bk-list">
        {blocks.map((b, i) => {
          if (b.type === "ol") {
            olCounter++;
          } else {
            olCounter = 0;
          }
          const currentOlNum = olCounter;

          return (
            <div
              key={b.id}
              className={`bk bk-${b.type}${b.checked ? " is-done" : ""}${over === b.id ? " bk-over" : ""}`}
              onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(b.id); } }}
              onDrop={() => dropOn(b.id)}
            >
              {/* Poignée Notion gauche avec drag & menu */}
              <div className="bk-side">
                <button
                  type="button"
                  className="bk-h"
                  aria-label="Ajouter un bloc dessous"
                  onClick={() => {
                    const n = { id: uid(), type: "p", text: "/" };
                    insertAfter(b.id, n, { id: n.id });
                    setMenu({ id: n.id, q: "", sel: 0 });
                  }}
                >
                  +
                </button>
                <button
                  type="button"
                  className="bk-h bk-grip"
                  aria-label="Options du bloc"
                  draggable
                  onDragStart={(e) => {
                    setDrag(b.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setDragImage(e.currentTarget.closest(".bk"), 0, 0);
                  }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHandleMenu(handleMenu?.id === b.id ? null : { id: b.id, i });
                  }}
                >
                  ⠿
                </button>
              </div>

              {/* Menu d'actions du bloc (clic sur ⠿) */}
              {handleMenu?.id === b.id && (
                <div className="pop bk-handle-menu" role="menu">
                  <div className="bk-hm-actions">
                    <button type="button" className="bk-hm-item" onClick={() => duplicateBlock(b.id)}>
                      <Icon id="duplicate" size={13} /> <span>Dupliquer</span>
                    </button>
                    <button type="button" className="bk-hm-item" onClick={() => moveBlock(b.id, -1)} disabled={i === 0}>
                      <Icon id="arrowUp" size={13} /> <span>Déplacer vers le haut</span>
                    </button>
                    <button type="button" className="bk-hm-item" onClick={() => moveBlock(b.id, 1)} disabled={i === blocks.length - 1}>
                      <Icon id="arrowDown" size={13} /> <span>Déplacer vers le bas</span>
                    </button>
                    <button type="button" className="bk-hm-item danger" onClick={() => removeBlock(b.id)}>
                      <Icon id="trash" size={13} /> <span>Supprimer</span>
                    </button>
                  </div>
                  <div className="bk-hm-sep" />
                  <div className="bk-hm-title">Transformer en</div>
                  <div className="bk-hm-types">
                    {ITEMS.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        className={`bk-hm-type ${b.type === item.type ? "is-active" : ""}`}
                        onClick={() => apply(b.id, item.type)}
                      >
                        <span className="opt-g"><Icon id={item.iconId} size={13} /></span>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Rendu spécifique par type de bloc */}
              {b.type === "hr" ? (
                <hr
                  tabIndex={0}
                  aria-label="Séparateur"
                  ref={(n) => reg(b.id, n)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" || e.key === "Delete") {
                      e.preventDefault();
                      const t = blocks[i + 1] ?? blocks[i - 1];
                      commit(blocks.filter((x) => x.id !== b.id), t && { id: t.id });
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const n = { id: uid(), type: "p", text: "" };
                      insertAfter(b.id, n, { id: n.id });
                    }
                  }}
                />
              ) : b.type === "code" ? (
                <div className="bk-code-card">
                  <div className="bk-code-header">
                    <select
                      className="bk-code-lang"
                      value={b.lang || "javascript"}
                      onChange={(e) => patch(b.id, { lang: e.target.value })}
                    >
                      {LANGS.map((lg) => (
                        <option key={lg} value={lg}>{lg}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="bk-code-copy"
                      onClick={() => {
                        copyToClipboard(b.text);
                        setCopiedCodeId(b.id);
                        setTimeout(() => setCopiedCodeId(null), 1500);
                      }}
                    >
                      <Icon id={copiedCodeId === b.id ? "check" : "copy"} size={11} />
                      <span>{copiedCodeId === b.id ? "Copié !" : "Copier"}</span>
                    </button>
                  </div>
                  <Txt
                    b={b}
                    reg={reg}
                    isOnly={blocks.length === 1}
                    className="bk-t bk-code-text"
                    aria-label={`Code ${i + 1}`}
                    onChange={(e) => onText(b, e.target.value)}
                    onKeyDown={(e) => onKey(e, b, i)}
                  />
                </div>
              ) : b.type === "callout" ? (
                <div className="bk-callout-card">
                  <button
                    type="button"
                    className="bk-callout-icon-btn"
                    title="Changer l'icône de l'encadré"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCalloutPickerId(calloutPickerId === b.id ? null : b.id);
                    }}
                  >
                    <Icon id={b.icon || "bulb"} size={16} />
                  </button>
                  {calloutPickerId === b.id && (
                    <div className="pop bk-callout-picker" role="menu">
                      {CALLOUT_ICONS.map((ic) => (
                        <button
                          key={ic}
                          type="button"
                          className={`bk-callout-icon-opt ${b.icon === ic ? "is-active" : ""}`}
                          onClick={() => {
                            patch(b.id, { icon: ic });
                            setCalloutPickerId(null);
                          }}
                        >
                          <Icon id={ic} size={15} />
                        </button>
                      ))}
                    </div>
                  )}
                  <Txt
                    b={b}
                    reg={reg}
                    isOnly={blocks.length === 1}
                    className="bk-t bk-callout-text"
                    aria-label={`Encadré ${i + 1}`}
                    onChange={(e) => onText(b, e.target.value.replace(/\n/g, " "))}
                    onKeyDown={(e) => onKey(e, b, i)}
                  />
                </div>
              ) : b.type === "toggle" ? (
                <div className="bk-toggle-card">
                  <button
                    type="button"
                    className={`bk-toggle-btn ${b.open ? "is-open" : ""}`}
                    aria-label={b.open ? "Replier" : "Déplier"}
                    onClick={() => patch(b.id, { open: !b.open })}
                  >
                    <Icon id="toggle" size={10} />
                  </button>
                  <div className="bk-toggle-body">
                    <Txt
                      b={b}
                      reg={reg}
                      isOnly={blocks.length === 1}
                      className="bk-t bk-toggle-text"
                      aria-label={`Volet ${i + 1}`}
                      onChange={(e) => onText(b, e.target.value.replace(/\n/g, " "))}
                      onKeyDown={(e) => onKey(e, b, i)}
                    />
                    {b.open && (
                      <div className="bk-toggle-content">
                        <small className="bk-toggle-hint">Astuce : Dépliez/repliez ce bloc en cliquant sur la flèche</small>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {b.type === "ul" && <span className="bk-dot" aria-hidden="true" />}
                  {b.type === "ol" && <span className="bk-ol-num" aria-hidden="true">{currentOlNum}.</span>}
                  {b.type === "todo" && (
                    <button
                      type="button"
                      className="chk"
                      aria-pressed={!!b.checked}
                      aria-label="Terminé"
                      onClick={() => patch(b.id, { checked: !b.checked })}
                    />
                  )}
                  <Txt
                    b={b}
                    reg={reg}
                    isOnly={blocks.length === 1}
                    className="bk-t"
                    aria-label={`Bloc ${i + 1}`}
                    onChange={(e) => onText(b, e.target.value.replace(/\n/g, " "))}
                    onKeyDown={(e) => onKey(e, b, i)}
                    onBlur={() => setMenu((m) => (m?.id === b.id ? null : m))}
                  />
                </>
              )}

              {/* Menu slash « / » Notion catégorisé */}
              {menu?.id === b.id && (() => {
                const list = filteredSlashItems(menu);
                return (
                  <div className="pop list slash bk-slash-menu" role="listbox" aria-label="Type de bloc">
                    {list.length === 0 && <p className="dx-empty slash-none">Aucun bloc correspondant</p>}
                    {list.map((item, k) => (
                      <button
                        key={item.type}
                        type="button"
                        role="option"
                        className="opt bk-slash-opt"
                        aria-selected={k === Math.min(menu.sel, list.length - 1)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          apply(b.id, item.type);
                        }}
                      >
                        <span className="opt-g" aria-hidden="true"><Icon id={item.iconId} size={15} /></span>
                        <div className="bk-slash-info">
                          <b>{item.label}</b>
                          <small>{item.desc}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Zone cliquable étendue sous le texte pour toujours pouvoir continuer d'écrire */}
      <div
        className="bk-canvas-tail"
        aria-hidden="true"
        onClick={() => {
          const last = blocks[blocks.length - 1];
          if (!last) return;
          if (last.type === "p" && !last.text) {
            refs.current[last.id]?.focus();
          } else {
            const nb = { id: uid(), type: "p", text: "", checked: false };
            commit([...blocks, nb], { id: nb.id, at: 0 });
          }
        }}
      />
    </div>
  );
}
