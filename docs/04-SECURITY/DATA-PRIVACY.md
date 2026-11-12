 # SÉCURITÉ — DONNÉES ET VIE PRIVÉE

## Séparation stricte Personal vs Pro

Paranoïa One applique un modèle de cloisonnement strict entre la sphère personnelle et la sphère professionnelle :

1. **Espace Personnel (100% Local)** :
   - Stockage local exclusif sur l'appareil (SQLite / LocalStorage du client).
   - Zéro synchronisation ou envoi des notes, habitudes, objectifs et tâches personnelles vers le serveur distant.
   - Fonctionne de manière entièrement autonome hors ligne.
   - Confidentialité et souveraineté absolue pour l'utilisateur.

2. **Espace Pro (Serveur & Collaboration)** :
   - Stockage et synchronisation sur le serveur distant (PostgreSQL via Caddy / API Rust).
   - Gestion d'équipe : workspaces, membres, rôles et invitations.
   - Tâches, livrables et activités partagés au sein de l'équipe.
   - Messagerie d'équipe et de support officielle (`support@paranoiastudio.fr`).

## Principes

- Collecter uniquement les données nécessaires au service.
- Personal est strictement privé et reste sur l'appareil.
- Pro est visible uniquement dans la portée du workspace et selon le rôle.
- Donner à l’utilisateur des mécanismes d’export et de suppression.
- Définir une durée de rétention avant la mise en production.

Les données de production ne doivent pas être copiées dans les environnements de développement. Les exports et sauvegardes restent protégés comme les données originales.

## Demandes utilisateur

Une demande d’accès, de correction, d’export ou de suppression est authentifiée, journalisée et traitée avec vérification des dépendances. Les obligations légales applicables priment sur les valeurs par défaut de cette documentation.