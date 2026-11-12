 # OPÉRATIONS — DÉPLOIEMENT

## Pipeline cible

1. Vérifier formatage, lint, compilation, tests et analyse des dépendances.
2. Construire une image immuable identifiée par commit.
3. Appliquer les migrations compatibles.
4. Déployer progressivement l’API.
5. Vérifier health check, erreurs, latence et logs.
6. Promouvoir ou revenir à l’image précédente.

Les migrations suivent le principe expand/migrate/contract pour permettre un rollback applicatif. Une migration non réversible doit être accompagnée d’une sauvegarde vérifiée et d’une procédure de reprise.

## Configuration

Les variables et secrets sont injectés par l’environnement de déploiement. Les valeurs par défaut de développement ne doivent jamais être utilisées en production.

La configuration mail de production est obligatoire dès qu’un flux de vérification, récupération ou notification est activé. Elle utilise un compte SMTP dédié et les variables décrites dans [`MAIL.md`](./MAIL.md).