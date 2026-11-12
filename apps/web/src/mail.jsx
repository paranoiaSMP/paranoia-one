import { useEffect, useMemo, useRef, useState } from "react";
import { Chevron, Icon } from "./icons";

const STORAGE_KEY = "paranoia_pro_mail_messages";

function readStoredEmails() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredEmails(emails) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emails));
  } catch {
    /* stockage indisponible */
  }
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function formatFullDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function MailPage({ api, token, user, workspace }) {
  const [emails, setEmails] = useState(readStoredEmails);
  const [folder, setFolder] = useState("inbox"); // 'inbox' | 'sent' | 'starred' | 'trash'
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [sendError, setSendError] = useState("");
  const [composing, setComposing] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [statusNotice, setStatusNotice] = useState("");
  const [mobilePane, setMobilePane] = useState("list"); // 'list' | 'detail'

  // Sauvegarde persistante des emails
  useEffect(() => {
    writeStoredEmails(emails);
  }, [emails]);

  const activeEmail = useMemo(
    () => emails.find((m) => m.id === selectedId) ?? null,
    [emails, selectedId]
  );

  // Marquer comme lu à l'ouverture
  useEffect(() => {
    if (activeEmail && activeEmail.unread) {
      setEmails((prev) =>
        prev.map((m) => (m.id === activeEmail.id ? { ...m, unread: false } : m))
      );
    }
  }, [activeEmail?.id]);

  // Nombre de messages non lus par dossier
  const unreadCount = useMemo(() => {
    return {
      inbox: emails.filter((m) => m.folder === "inbox" && m.unread).length,
      sent: 0,
      starred: emails.filter((m) => m.starred && m.unread).length,
      trash: 0,
    };
  }, [emails]);

  // Filtrage des messages
  const filteredEmails = useMemo(() => {
    return emails.filter((m) => {
      // Filtrage par dossier / vue
      if (folder === "starred") {
        if (!m.starred || m.folder === "trash") return false;
      } else if (m.folder !== folder) {
        return false;
      }

      // Filtre non lus
      if (filterUnreadOnly && !m.unread) return false;

      // Recherche textuelle
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchSubject = m.subject?.toLowerCase().includes(q);
        const matchFrom = `${m.fromName} ${m.fromEmail}`.toLowerCase().includes(q);
        const matchBody = m.body?.toLowerCase().includes(q);
        const matchTo = m.to?.toLowerCase().includes(q);
        if (!matchSubject && !matchFrom && !matchBody && !matchTo) return false;
      }

      return true;
    });
  }, [emails, folder, filterUnreadOnly, search]);

  const selectEmail = (id) => {
    setSelectedId(id);
    setMobilePane("detail");
    setReplyText("");
    setSendError("");
  };

  const toggleStar = (id, e) => {
    e?.stopPropagation();
    setEmails((prev) =>
      prev.map((m) => (m.id === id ? { ...m, starred: !m.starred } : m))
    );
  };

  const toggleUnread = (id, e) => {
    e?.stopPropagation();
    setEmails((prev) =>
      prev.map((m) => (m.id === id ? { ...m, unread: !m.unread } : m))
    );
  };

  const deleteEmail = (id, e) => {
    e?.stopPropagation();
    const mail = emails.find((m) => m.id === id);
    if (!mail) return;

    if (mail.folder === "trash") {
      if (window.confirm("Supprimer définitivement ce message ?")) {
        setEmails((prev) => prev.filter((m) => m.id !== id));
        if (selectedId === id) setSelectedId(null);
        setStatusNotice("Message supprimé définitivement.");
      }
    } else {
      setEmails((prev) =>
        prev.map((m) => (m.id === id ? { ...m, previousFolder: m.folder, folder: "trash" } : m))
      );
      if (selectedId === id) { setSelectedId(null); setMobilePane("list"); }
      setStatusNotice("Message déplacé dans la corbeille.");
    }
    setTimeout(() => setStatusNotice(""), 3000);
  };

  const restoreEmail = (id, e) => {
    e?.stopPropagation();
    setEmails((prev) =>
      prev.map((m) => (m.id === id ? { ...m, folder: m.previousFolder || "inbox" } : m))
    );
    setStatusNotice("Message restauré dans son dossier.");
    setTimeout(() => setStatusNotice(""), 3000);
  };

  useEffect(() => { setSelectedId(null); setMobilePane("list"); setSendError(""); }, [folder, search]);

  async function sendMessage(message) {
    if (!api || !token) throw new Error("Connectez-vous pour envoyer un message. Votre brouillon est conservé.");
    let response;
    try {
      response = await fetch(`${api}/api/v1/mail/send`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(message), signal: AbortSignal.timeout(15000),
      });
    } catch { throw new Error("Envoi non confirmé : connexion indisponible. Votre brouillon est conservé."); }
    if (!response.ok) {
      if (response.status === 404) throw new Error("L’envoi d’e-mails n’est pas encore disponible sur ce serveur. Votre brouillon est conservé.");
      throw new Error("Le serveur a refusé l’envoi. Votre brouillon est conservé.");
    }
  }

  // Envoi d'une réponse rapide
  const handleQuickReply = async (e) => {
    e.preventDefault();
    if (sending || !replyText.trim() || !activeEmail) return;

    setSending(true);
    const replySubject = activeEmail.subject.startsWith("Re:")
      ? activeEmail.subject
      : `Re: ${activeEmail.subject}`;

    const newReply = {
      id: `mail-${Date.now()}`,
      fromName: user?.display_name || "Support Paranoïa Studio",
      fromEmail: "support@paranoiastudio.fr",
      to: activeEmail.fromEmail,
      subject: replySubject,
      date: new Date().toISOString(),
      preview: replyText.trim().slice(0, 100),
      body: `${replyText.trim()}\n\n--- Message d'origine ---\nDe : ${activeEmail.fromName} <${activeEmail.fromEmail}>\nDate : ${formatFullDate(activeEmail.date)}\n\n${activeEmail.body}`,
      folder: "sent",
      unread: false,
      starred: false,
      tag: "Support",
    };

    setSendError("");
    try { await sendMessage({ to: activeEmail.fromEmail, subject: replySubject, body: replyText.trim() }); }
    catch (error) { setSendError(error.message); setSending(false); return; }

    setEmails((prev) => [newReply, ...prev]);
    setReplyText("");
    setSending(false);
    setStatusNotice(`Réponse envoyée à ${activeEmail.fromEmail}`);
    setTimeout(() => setStatusNotice(""), 3500);
  };

  // Envoi d'un nouvel e-mail depuis la modale
  const handleSendCompose = async ({ to, subject, body }) => {
    if (sending) return;
    setSending(true);
    const newMail = {
      id: `mail-${Date.now()}`,
      fromName: user?.display_name || "Support Paranoïa Studio",
      fromEmail: "support@paranoiastudio.fr",
      to,
      subject,
      date: new Date().toISOString(),
      preview: body.slice(0, 100),
      body,
      folder: "sent",
      unread: false,
      starred: false,
      tag: "Équipe",
    };

    setSendError("");
    try { await sendMessage({ to, subject, body }); }
    catch (error) { setSendError(error.message); setSending(false); return; }

    setEmails((prev) => [newMail, ...prev]);
    setSending(false);
    setComposing(false);
    setFolder("sent");
    setSelectedId(newMail.id);
    setStatusNotice(`Message envoyé à ${to}`);
    setTimeout(() => setStatusNotice(""), 3500);
  };

  return (
    <section className="mail-view" aria-label="Mail">
      <header className="mail-page-heading"><div><h1>Mail</h1><p>Vos échanges, au même endroit.</p></div><span className="mail-local-state">Non connecté à une boîte mail</span></header>
      <p className="mail-connection-note">Réception et envoi indisponibles. Les messages ci-dessous sont locaux.</p>
      {statusNotice && (
        <div className="mail-notice" role="status">
          <Icon id="check" size={14} />
          <span>{statusNotice}</span>
        </div>
      )}

      <div className={`mail-layout ${mobilePane === "detail" ? "show-detail" : "show-list"}`}>
        {/* COLONNE 1: DOSSIERS & COMPTE */}
        <nav className="mail-folders" aria-label="Dossiers de messagerie">
          <button
            className="dx-btn primary mail-compose-trigger"
            type="button"
            onClick={() => { setSendError(""); setComposing(true); }}
          >
            <Icon id="send" size={14} />
            <span>Nouveau message</span>
          </button>

          <div className="mail-account-badge">
            <span className="mail-dot-online" title="Stockage local" />
            <div>
              <strong>Messages locaux</strong>
              <small>{workspace?.name || "Espace Pro"}</small>
            </div>
          </div>

          <div className="mail-folder-links">
            <button
              className={`mail-folder-btn ${folder === "inbox" ? "is-active" : ""}`}
              type="button"
              onClick={() => {
                setFolder("inbox");
                setMobilePane("list");
              }}
            >
              <Icon id="inbox" size={16} />
              <span>Boîte de réception</span>
              {unreadCount.inbox > 0 && (
                <span className="mail-badge">{unreadCount.inbox}</span>
              )}
            </button>

            <button
              className={`mail-folder-btn ${folder === "sent" ? "is-active" : ""}`}
              type="button"
              onClick={() => {
                setFolder("sent");
                setMobilePane("list");
              }}
            >
              <Icon id="send" size={16} />
              <span>Messages envoyés</span>
            </button>

            <button
              className={`mail-folder-btn ${folder === "starred" ? "is-active" : ""}`}
              type="button"
              onClick={() => {
                setFolder("starred");
                setMobilePane("list");
              }}
            >
              <Icon id="star" size={16} />
              <span>Suivis / Étoilés</span>
              {unreadCount.starred > 0 && (
                <span className="mail-badge">{unreadCount.starred}</span>
              )}
            </button>

            <button
              className={`mail-folder-btn ${folder === "trash" ? "is-active" : ""}`}
              type="button"
              onClick={() => {
                setFolder("trash");
                setMobilePane("list");
              }}
            >
              <Icon id="trash" size={16} />
              <span>Corbeille</span>
            </button>
          </div>

          <div className="mail-folders-footer">
            <small>Conservés sur cet appareil</small>
          </div>
        </nav>

        {/* COLONNE 2: LISTE DES MESSAGES */}
        <section className="mail-list-pane" aria-label="Liste des messages">
          <div className="mail-list-header">
            <div className="mail-search-wrap">
              <input
                type="search"
                className="mail-search-input"
                placeholder="Rechercher un message…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Rechercher dans les messages"
              />
            </div>
            <div className="mail-list-filters">
              <button
                className={`mail-filter-pill ${!filterUnreadOnly ? "is-active" : ""}`}
                type="button"
                onClick={() => setFilterUnreadOnly(false)}
              >
                Tous ({filteredEmails.length})
              </button>
              <button
                className={`mail-filter-pill ${filterUnreadOnly ? "is-active" : ""}`}
                type="button"
                onClick={() => setFilterUnreadOnly(true)}
              >
                Non lus
              </button>
            </div>
          </div>

          <div className="mail-items-scroll">
            {filteredEmails.length === 0 ? (
              <div className="mail-empty-list">
                <Icon id="mail" size={24} />
                <p>Aucun message dans ce dossier</p>
                {search && <small>Essayez de modifier votre recherche</small>}
              </div>
            ) : (
              <ul className="mail-items-list" role="list">
                {filteredEmails.map((mail) => {
                  const isSelected = mail.id === selectedId;
                  const isSent = mail.folder === "sent";
                  const displayTitle = isSent ? `À : ${mail.to}` : mail.fromName;

                  return (
                    <li
                      key={mail.id}
                      className={`mail-item ${mail.unread ? "is-unread" : ""} ${isSelected ? "is-selected" : ""}`}
                      onClick={() => selectEmail(mail.id)}
                      onKeyDown={(e) => e.key === "Enter" && selectEmail(mail.id)}
                      tabIndex={0}
                      role="button"
                      aria-label={`${mail.unread ? "Non lu: " : ""}${displayTitle}, ${mail.subject}`}
                    >
                      <div className="mail-item-top">
                        <div className="mail-item-sender">
                          {mail.unread && <span className="mail-unread-dot" aria-hidden="true" />}
                          <strong>{displayTitle}</strong>
                        </div>
                        <time className="mail-item-date">{formatDate(mail.date)}</time>
                      </div>

                      <div className="mail-item-subject">
                        <span>{mail.subject}</span>
                      </div>

                      <p className="mail-item-preview">{mail.preview}</p>

                      <div className="mail-item-actions">
                        {mail.tag && <span className="mail-tag">{mail.tag}</span>}
                        <button
                          type="button"
                          className={`mail-icon-action ${mail.starred ? "is-starred" : ""}`}
                          aria-label={mail.starred ? "Retirer l’étoile" : "Ajouter aux suivis"}
                          onClick={(e) => toggleStar(mail.id, e)}
                        >
                          <Icon id="star" size={14} />
                        </button>
                        <button
                          type="button"
                          className="mail-icon-action mail-del-btn"
                          aria-label="Supprimer le message"
                          onClick={(e) => deleteEmail(mail.id, e)}
                        >
                          <Icon id="trash" size={14} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* COLONNE 3: LECTURE DU MESSAGE & RÉPONSE RAPIDE */}
        <main className="mail-reading-pane" aria-label="Contenu du message">
          {mobilePane === "detail" && (
            <button
              className="mail-back-mobile dx-btn"
              type="button"
              onClick={() => setMobilePane("list")}
            >
              <Chevron dir="left" size={14} />
              <span>Retour à la liste</span>
            </button>
          )}

          {activeEmail ? (
            <article className="mail-body-card">
              <header className="mail-read-header">
                <div className="mail-read-title-row">
                  <h2>{activeEmail.subject}</h2>
                  <div className="mail-read-toolbar">
                    <button
                      className={`dx-iconbtn ${activeEmail.starred ? "is-starred" : ""}`}
                      type="button"
                      aria-label={activeEmail.starred ? "Retirer des suivis" : "Suivre ce message"}
                      onClick={(e) => toggleStar(activeEmail.id, e)}
                    >
                      <Icon id="star" size={16} />
                    </button>
                    <button
                      className="dx-iconbtn"
                      type="button"
                      aria-label={activeEmail.unread ? "Marquer comme lu" : "Marquer comme non lu"}
                      onClick={(e) => toggleUnread(activeEmail.id, e)}
                    >
                      <Icon id="check" size={16} />
                    </button>
                    {activeEmail.folder === "trash" ? (
                      <button
                        className="dx-btn"
                        type="button"
                        onClick={(e) => restoreEmail(activeEmail.id, e)}
                      >
                        Restaurer
                      </button>
                    ) : (
                      <button
                        className="dx-iconbtn"
                        type="button"
                        aria-label="Déplacer dans la corbeille"
                        onClick={(e) => deleteEmail(activeEmail.id, e)}
                      >
                        <Icon id="trash" size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mail-read-meta">
                  <div className="mail-avatar" aria-hidden="true">
                    {activeEmail.fromName ? activeEmail.fromName[0].toUpperCase() : "P"}
                  </div>
                  <div className="mail-meta-details">
                    <div className="mail-from-line">
                      <strong>{activeEmail.fromName}</strong>
                      <span className="mail-email-bracket">&lt;{activeEmail.fromEmail}&gt;</span>
                    </div>
                    <div className="mail-to-line">
                      <small>À : {activeEmail.to}</small>
                    </div>
                  </div>
                  <time className="mail-read-timestamp">
                    {formatFullDate(activeEmail.date)}
                  </time>
                </div>
              </header>

              <div className="mail-content-text">
                {activeEmail.body.split("\n\n").map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>

              {/* ZONE DE RÉPONSE RAPIDE */}
              {activeEmail.folder !== "trash" && (
                <form className="mail-reply-box" onSubmit={handleQuickReply}>
                  <div className="mail-reply-header">
                    <Icon id="reply" size={14} />
                    <span>Répondre à <b>{activeEmail.fromEmail}</b></span>
                  </div>
                  <textarea
                    rows={4}
                    className="mail-reply-input"
                    placeholder="Écrivez votre réponse ici…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    aria-label="Votre réponse"
                  />
                  {sendError && <p className="mail-send-error" role="alert">{sendError}</p>}
                  <div className="mail-reply-actions">
                    <button
                      className="dx-btn primary"
                      type="submit"
                      disabled={sending || !replyText.trim()}
                    >
                      <Icon id="send" size={14} />
                      <span>{sending ? "Envoi…" : "Envoyer la réponse"}</span>
                    </button>
                  </div>
                </form>
              )}
            </article>
          ) : (
            <div className="mail-no-selection">
              <Icon id="mail" size={32} />
              <p>Sélectionnez un message pour le lire</p>
            </div>
          )}
        </main>
      </div>

      {/* MODALE DE NOUVEAU MESSAGE */}
      {composing && (
        <ComposeModal
          onClose={() => setComposing(false)}
          onSend={handleSendCompose}
          sending={sending}
          error={sendError}
        />
      )}
    </section>
  );
}

function ComposeModal({ onClose, onSend, sending, error }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    onSend({ to: to.trim(), subject: subject.trim(), body: body.trim() });
  };

  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    dialog.querySelector("#compose-to")?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={dialogRef} className="mail-compose-backdrop" aria-labelledby="compose-title" onCancel={(event) => { event.preventDefault(); if (!sending) onClose(); }}>
      <form className="mail-compose-card" onSubmit={handleSubmit}>
        <div className="mail-compose-header">
          <h2 id="compose-title">Nouveau message</h2>
          <button
            className="dx-iconbtn"
            type="button"
            aria-label="Fermer"
            disabled={sending}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="mail-compose-fields">
          <div className="mail-field-row">
            <span className="mail-field-label">De :</span>
            <span className="mail-from-fixed">Adresse d’envoi non configurée</span>
          </div>

          <div className="mail-field-row">
            <label htmlFor="compose-to" className="mail-field-label">À :</label>
            <input
              id="compose-to"
              type="email"
              required
              placeholder="destinataire@exemple.fr"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              autoFocus
            />
          </div>

          <div className="mail-field-row">
            <label htmlFor="compose-subject" className="mail-field-label">Objet :</label>
            <input
              id="compose-subject"
              type="text"
              required
              placeholder="Objet du message"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="mail-body-field">
            <textarea
              aria-label="Message"
              required
              rows={10}
              placeholder="Votre message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="mail-send-error" role="alert">{error}</p>}
        <div className="mail-compose-footer">
          <button className="dx-btn" type="button" onClick={onClose} disabled={sending}>
            Annuler
          </button>
          <button className="dx-btn primary" type="submit" disabled={sending || !to || !subject || !body}>
            <Icon id="send" size={14} />
            <span>{sending ? "Envoi en cours…" : "Envoyer"}</span>
          </button>
        </div>
      </form>
    </dialog>
  );
}
