 # OPÉRATIONS — SAUVEGARDES

## Politique cible

- Sauvegardes PostgreSQL automatiques et chiffrées.
- Versionnement ou réplication des fichiers selon leur criticité.
- Rétention définie par environnement et obligation applicable.
- Accès aux sauvegardes limité et audité.

## Vérification

Une sauvegarde non restaurée n’est pas considérée comme fiable. Tester périodiquement une restauration dans un environnement isolé, vérifier les migrations et mesurer le RPO/RTO obtenu.

En cas d’incident : geler les opérations destructives, identifier le dernier point sain, restaurer sur une instance isolée, valider l’intégrité puis basculer selon la procédure approuvée.