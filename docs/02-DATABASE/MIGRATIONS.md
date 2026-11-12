 # BASE DE DONNÉES — MIGRATIONS

Les migrations sont versionnées, append-only et exécutées au démarrage lorsque `DATABASE_URL` est configurée. Le backend utilise sa table dédiée `paranoia_schema_migrations` afin de ne pas mélanger son historique avec celui d’une autre application partageant la même base PostgreSQL. Une migration déjà appliquée ne doit jamais être modifiée.

La première migration est [`20261103141000_identity.sql`](../../backend/migrations/20261103141000_identity.sql). Elle crée `users`, `sessions`, les contraintes d’identité et les index de sessions. Elle active l’extension PostgreSQL `pgcrypto` pour générer les UUID côté base.

La migration [`20261103150000_notes.sql`](../../backend/migrations/20261103150000_notes.sql) crée les notes personnelles, leur propriétaire et l’index de lecture par utilisateur.

La migration [`20261103152000_workspaces.sql`](../../backend/migrations/20261103152000_workspaces.sql) crée les workspaces, les membres et les rôles de base.

La migration [`20261103154000_tasks.sql`](../../backend/migrations/20261103154000_tasks.sql) crée les tâches personnelles, leurs statuts, priorités et échéances.

## Procédure

1. Écrire la migration avec contraintes et index nécessaires.
2. Tester l’application sur une base vide et sur une copie représentative.
3. Vérifier la compatibilité avec l’ancienne version de l’API.
4. Déployer la migration avant le code qui dépend du nouveau schéma.
5. Documenter les opérations de remplissage ou de retrait.

## Règles de production

- Pas de migration destructive dans le chemin de démarrage de chaque replica.
- Les gros backfills sont découpés et observés.
- Toute suppression nécessite une sauvegarde vérifiée.
- Les changements incompatibles suivent un cycle expand/migrate/contract.

La procédure de restauration est décrite dans [`BACKUPS.md`](../06-OPERATIONS/BACKUPS.md).