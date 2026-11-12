 # ARCHITECTURE — BACKEND

## État actuel

Le backend est un crate Rust en édition 2024. Il fournit déjà un serveur Axum minimal avec configuration par environnement, arrêt gracieux, tracing HTTP, health check et format d’erreur JSON. Les modules sont séparés dans [`backend/src/`](../../backend/src/) et restent volontairement courts.

Routes disponibles :

- `GET /health` : renvoie `{"status":"ok"}` ;
- `GET /ready` : vérifie que PostgreSQL est configuré et joignable ;
- `GET /api/v1/status` : renvoie le nom et la version du service ;
- `POST /api/v1/auth/register` : crée un compte et une session ;
- `POST /api/v1/auth/login` : ouvre une session ;
- `POST /api/v1/auth/logout` : révoque le token Bearer courant ;
- `GET /api/v1/me` : vérifie la session et renvoie le profil courant ;
- `GET/POST /api/v1/notes` : liste ou crée les notes personnelles ;
- `PUT/DELETE /api/v1/notes/{id}` : modifie ou supprime une note personnelle ;
- `GET/POST /api/v1/workspaces` : liste ou crée les workspaces ;
- `POST /api/v1/workspaces/{id}/invitations` : invite un membre avec un rôle ;
- `GET/POST /api/v1/tasks` : liste ou crée les tâches personnelles ;
- `PUT/DELETE /api/v1/tasks/{id}` : modifie ou supprime les tâches personnelles ;
- toute route inconnue : erreur JSON `404` avec le code `not_found`.

Protections déjà actives :

- corps de requête limité à 1 MiB pour limiter les abus de ressources ;
- conversion des paniques en réponse serveur contrôlée ;
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` et `Cache-Control` ;
- tracing limité à la méthode et au chemin, sans journaliser la query string.

Les limites de taille, les en-têtes, le format des erreurs et le hash des mots de passe sont vérifiés par des tests. L’autorisation des ressources métier reste à implémenter avant l’ajout de données utilisateur accessibles.

Variables d’environnement :

- `BIND_ADDRESS` (défaut : `127.0.0.1:8080`) ;
- `DATABASE_URL` (optionnelle en développement, obligatoire pour la readiness et les migrations) ;
- `RUST_LOG` (défaut : `paranoia_api=info`).
- `DEV_ADMIN_EMAIL` (obligatoire) : adresse du compte développeur autorisé (plusieurs possibles, séparées par des virgules) à créer des comptes et des données.

Lorsque `DATABASE_URL` est présente, le serveur ouvre un pool PostgreSQL, applique les migrations versionnées puis devient `ready`. Sans cette variable, le serveur reste utilisable pour le health check mais `/ready` renvoie `503`.

## Organisation cible

```text
backend/
├── src/
│   ├── main.rs          # démarrage, configuration et serveur
│   ├── http/            # routes, extracteurs et réponses
│   ├── domain/          # règles métier et types
│   ├── services/        # cas d’usage
│   ├── repositories/    # accès PostgreSQL / stockage
│   ├── auth/            # sessions et autorisation
│   └── sync/            # changements et conflits
└── migrations/          # migrations propres au backend
```

Cette structure est appliquée dans le code. Une route reste mince : elle valide la forme de la requête, appelle un service et convertit le résultat en réponse. Les repositories ne contiennent pas de règles de permission.

## Requête type

1. Tracing crée ou propage un identifiant de requête.
2. L’authentification extrait l’identité de session.
3. Le service vérifie la portée Personal ou Workspace.
4. Le repository exécute une requête paramétrée dans une transaction si nécessaire.
5. La réponse utilise le format d’erreur commun.

## Configuration et arrêt

La configuration vient de variables d’environnement validées au démarrage. Les secrets ne sont jamais journalisés. Le serveur gère `SIGINT` et `SIGTERM`, termine les requêtes en cours puis ferme proprement les connexions.