 # BASE DE DONNÉES — SCHÉMA

## Principes

La base cible est PostgreSQL. Toutes les tables utilisent un identifiant UUID, `created_at` et `updated_at` en UTC. Les mutations concurrentes utilisent une colonne de version ou un contrôle explicite de timestamp.

## Entités principales

| Table | Rôle |
|---|---|
| `users` | identité et profil |
| `sessions` | sessions révocables |
| `workspaces` | espaces Pro |
| `workspace_members` | appartenance et rôle |
| `projects` | projets Personal ou Pro |
| `tasks` | tâches, statut, priorité et échéance |
| `notes` | notes personnelles |
| `calendar_events` | événements |
| `files` | métadonnées de fichiers |
| `notifications` | notifications destinées à un utilisateur |
| `change_log` | changements consommables par la synchronisation |
| `notes` | notes personnelles appartenant à un utilisateur |

Les colonnes de contenu doivent être bornées et les recherches fréquentes indexées. Les suppressions de données utilisateur doivent respecter la politique de rétention et ne pas laisser de référence orpheline.

## Timestamps et audit

Les timestamps sont écrits par le serveur. Les actions de sécurité et changements de permissions doivent avoir une trace d’audit distincte du journal technique.