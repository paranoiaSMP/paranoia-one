 # PARANOÏA ONE — ROADMAP

**Version:** 1.0  
**Statut:** Prévisionnel

La roadmap décrit l’ordre de livraison cible. Une fonctionnalité marquée « planifiée » n’est pas encore disponible dans le dépôt.

## Phase 0 — Fondations

- [x] Initialiser le workspace et le crate backend Rust.
- [x] Choisir Axum, Tokio, Serde et tracing.
- [ ] Ajouter les applications web, desktop et phone.
- [ ] Ajouter les conventions de contribution et la CI.

## Phase 1 — Socle backend

- [ ] Configurer la lecture de configuration par environnement.
- [ ] Ajouter la connexion PostgreSQL et les migrations SQLx.
- [ ] Implémenter le serveur HTTP, le health check et les logs structurés.
- [ ] Définir les contrats REST versionnés.
- [ ] Ajouter les tests unitaires, d’intégration et de contrat.

## Phase 2 — Identité et données personnelles

- [ ] Inscription, vérification d’adresse et connexion.
- [ ] Sessions révocables, récupération de compte et profil.
- [ ] Notes, tâches, calendrier, habitudes, objectifs et projets personnels.
- [ ] Pagination, recherche et autosauvegarde.

## Phase 3 — Collaboration Pro

- [ ] Workspaces, invitations et membres.
- [ ] Rôles, permissions et séparation stricte des tenants.
- [ ] Projets, tâches assignées, commentaires et activité.
- [ ] Notifications et annonces.

## Phase 4 — Clients et synchronisation

- [ ] Client web React/TypeScript.
- [ ] Client desktop Tauri 2.
- [ ] Client mobile React Native.
- [ ] Cache local SQLite et file d’opérations hors ligne.
- [ ] Résolution des conflits et observabilité de la synchronisation.

## Phase 5 — Production

- [ ] Déploiement reproductible et migrations contrôlées.
- [ ] Sauvegardes restaurables et procédure de reprise.
- [ ] Monitoring, alertes et tableaux de bord.
- [ ] Revue de sécurité, accessibilité et performance.

## Critères de passage

Chaque phase doit fournir une implémentation testée, une documentation mise à jour et une stratégie de migration ou de compatibilité pour les clients existants.