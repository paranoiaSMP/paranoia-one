 # API — RÉFÉRENCE

## Convention

L’API REST cible est préfixée par `/api/v1`. Les requêtes et réponses métier utilisent JSON ; les dates sont en ISO 8601 UTC et les identifiants sont opaques.

## Endpoints actuellement disponibles

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/health` | état technique, sans authentification |
| `GET` | `/ready` | disponibilité de la base PostgreSQL |
| `GET` | `/api/v1/status` | nom et version du service |

Les routes inconnues renvoient `404` avec l’enveloppe d’erreur standard.

## Audit et launcher (administrateurs)

Les routes `/api/v1/admin/*` exigent un jeton de session dont l'email figure dans `DEV_ADMIN_EMAIL`, sinon `403 forbidden`. `GET /api/v1/me` renvoie `is_admin`.

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/v1/admin/audit?limit=50&before=<id>&action=<préfixe>` | journal, plus récent d'abord, pagination par `before` |
| `GET` | `/api/v1/admin/launcher/installs` | installations du launcher |
| `POST` | `/api/v1/admin/launcher/installs` | crée une installation (`{label}`), renvoie le jeton `pl_…` une seule fois |
| `POST` | `/api/v1/admin/launcher/installs/{id}/revoke` | `actif` vers `revoque` |
| `POST` | `/api/v1/admin/launcher/installs/{id}/reactivate` | `revoque` vers `actif` |
| `POST` | `/api/v1/admin/launcher/installs/{id}/delete-order` | `revoque` vers `a_supprimer` (`409` si l'installation n'est pas révoquée) |

Routes appelées par le launcher, avec `Authorization: Bearer pl_…` (seule l'empreinte SHA-256 est stockée) :

| Méthode | Route | Corps | Effet |
|---|---|---|---|
| `POST` | `/api/v1/launcher/checkin` | `{version?, binary_hash?}` | met à jour `last_seen`, journalise un changement d'empreinte, renvoie `{status}` |
| `POST` | `/api/v1/launcher/incident` | `{kind, detail?}` avec `kind` dans `extraction_attempt`, `tamper`, `hash_mismatch` | journalise et révoque le launcher uniquement |
| `POST` | `/api/v1/launcher/deleted` | aucun | confirme que le launcher a supprimé ses propres fichiers (`supprime`) |

Le launcher ne supprime que les fichiers de son propre manifeste, et seulement sur ordre explicite (`a_supprimer`) ou après une tentative d'extraction du Mod. Le journal `audit_log` est append-only (règles Postgres bloquant `UPDATE` et `DELETE`). L'adresse IP vient de `X-Forwarded-For` (à poser par le reverse proxy) ou de l'adresse du pair.

## Tâches avancées: sous-tâches, dépendances, récurrence

- `POST /api/v1/tasks` accepte `parent_id` (sous-tâche, un seul niveau; elle hérite de l'équipe du parent, `workspace_id` est ignoré) et `recurrence` (`none` par défaut, `daily`, `weekly`, `monthly`).
- `PUT /api/v1/tasks/{id}` remplace aussi `blocked_by` (une seule tâche bloquante, absente = aucune) et `recurrence`. Le blocage doit rester dans la même équipe (ou chez le même propriétaire en privé), sans se viser lui-même ni former de boucle: sinon `invalid_input`.
- Terminer une tâche dont la bloquante n'est ni `done` ni `cancelled` renvoie `conflict`.
- Terminer une tâche récurrente crée l'occurrence suivante (`todo`, échéance = échéance précédente ou aujourd'hui, + 1 jour / 7 jours / 1 mois).
- Les tâches renvoient `parent_id`, `blocked_by`, `blocked` (bloquante encore ouverte), `recurrence`, `subtasks` et `subtasks_done`.

## Tâches d'équipe, commentaires et notifications

`POST /api/v1/tasks` accepte `workspace_id` (tâche d'équipe) et `assignee_id` (membre de cette équipe). `PUT /api/v1/tasks/{id}` remplace aussi `assignee_id` (absent = non assignée); l'équipe d'une tâche ne change pas. Les tâches renvoient `workspace_id`, `assignee_id`, `assignee` et `comments` (nombre).

| Rôle dans l'équipe | Voir et commenter | Modifier | Supprimer |
|---|---|---|---|
| `owner`, `admin` | oui | oui | oui |
| `member` | oui | oui | non (`403`) |
| `viewer` | lire seulement (`403` en écriture) | non | non |

Le créateur d'une tâche garde tous les droits dessus. Une tâche privée (sans `workspace_id`) reste invisible pour les autres (`404`); sa création reste réservée aux administrateurs, alors que tout membre non lecteur peut créer dans son équipe. Accepter une invitation est ouvert à tout compte dont l'email correspond.

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/v1/workspaces/{id}/members` | membres `{id, name, role}` (`404` si l'appelant n'en fait pas partie) |
| `GET` | `/api/v1/tasks/{id}/comments` | commentaires, plus ancien d'abord (200 max) |
| `POST` | `/api/v1/tasks/{id}/comments` | `{body}` de 1 à 2000 caractères |
| `DELETE` | `/api/v1/comments/{id}` | auteur, ou responsable de l'équipe |
| `GET` | `/api/v1/notifications` | 30 dernières: `{items:[{id, kind, text, link, read, created_at}], unread}` |
| `POST` | `/api/v1/notifications/read` | marque tout comme lu (`204`) |

Notifications créées: `comment` (au créateur et à la personne assignée, jamais à l'auteur), `assignment` (à la personne assignée) et `invitation` (si l'email invité a déjà un compte).

## Authentification disponible

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | créer un compte |
| `POST` | `/api/v1/auth/login` | ouvrir une session |
| `POST` | `/api/v1/auth/logout` | révoquer la session |
| `GET` | `/api/v1/me` | récupérer le profil de la session courante |
| `GET` | `/api/v1/auth/sessions` | lister les sessions actives |
| `DELETE` | `/api/v1/auth/sessions/{id}` | révoquer une session |
| `DELETE` | `/api/v1/auth/sessions` | révoquer toutes les autres sessions |
| `GET` | `/api/v1/notes` | lister les notes personnelles (`limit`, `cursor`, `q`) |
| `POST` | `/api/v1/notes` | créer une note personnelle |
| `PUT` | `/api/v1/notes/{id}` | modifier une note personnelle |
| `DELETE` | `/api/v1/notes/{id}` | supprimer une note personnelle |
| `GET` | `/api/v1/workspaces` | lister les workspaces accessibles |
| `POST` | `/api/v1/workspaces` | créer un workspace |
| `POST` | `/api/v1/workspaces/{id}/invitations` | inviter un membre (owner/admin) |
| `POST` | `/api/v1/workspace-invitations/{id}/accept` | accepter une invitation reçue |
| `GET` | `/api/v1/tasks` | lister les tâches personnelles (`limit`, `cursor`, `q`) |
| `POST` | `/api/v1/tasks` | créer une tâche personnelle |
| `PUT` | `/api/v1/tasks/{id}` | modifier une tâche personnelle |
| `DELETE` | `/api/v1/tasks/{id}` | supprimer une tâche personnelle |
| `GET` | `/api/v1/events` | lister les événements personnels |
| `POST` | `/api/v1/events` | créer un événement personnel |

Ces routes exigent une base configurée. `register` et `login` renvoient un token Bearer opaque valable 30 jours. Le token n’est jamais journalisé et seul son hash est stocké en base. `logout` attend `Authorization: Bearer <token>` et renvoie `204`.

## Format des listes

Les listes de notes et de tâches renvoient :

```json
{
  "items": [],
  "next_cursor": null
}
```

`limit` est compris entre 1 et 100 et vaut 50 par défaut. `q` recherche dans le titre
et le contenu ou la description. `next_cursor` est opaque et doit être renvoyé tel quel
dans la requête suivante.

## Endpoints prévus

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/v1/workspaces/{id}/invitations` | inviter un membre |
| `GET` | `/api/v1/sync` | récupérer les changements |
| `POST` | `/api/v1/sync/mutations` | envoyer des mutations |

Ces routes sont planifiées et ne sont pas encore implémentées dans le backend.

## Réponses actuelles

Health check :

```json
{"status":"ok"}
```

Readiness sans base configurée ou indisponible :

```json
{"status":"not_ready"}
```

Statut du service :

```json
{"service":"paranoia-api","version":"0.1.0"}
```

Erreur de route inconnue :

```json
{
  "error": {
    "code": "not_found",
    "message": "The requested resource was not found."
  }
}
```

Les endpoints techniques ne nécessitent pas d’authentification. Les endpoints d’authentification nécessitent PostgreSQL et les routes métier nécessiteront une session valide.

Les comptes listés dans `DEV_ADMIN_EMAIL` (séparés par des virgules) sont les seuls autorisés à créer des comptes, notes, tâches, workspaces et invitations. Les autres comptes, s’ils existent, peuvent être conservés pour consultation et opérations autorisées, mais reçoivent `403 forbidden` pour toute création.

Les notes sont strictement privées : chaque opération filtre par l’utilisateur de la session et ne peut pas accéder à la note d’un autre utilisateur.

## Pagination

Les collections utilisent `limit` borné et un curseur opaque `next_cursor`. Une réponse paginée contient `items` et `next_cursor`; l’absence de curseur signifie la fin.

## Idempotence

Les créations rejouables acceptent une clé `Idempotency-Key`. Le serveur conserve le résultat associé pendant la durée documentée et renvoie le même résultat pour la même requête.