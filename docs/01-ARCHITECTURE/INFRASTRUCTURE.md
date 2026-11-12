 # ARCHITECTURE — INFRASTRUCTURE

## Cible d’exécution

Le service API s’exécute dans un conteneur stateless derrière **Caddy** comme reverse proxy (HTTPS automatique avec Let's Encrypt, HTTP/2 et HTTP/3). La configuration prête pour la production se trouve dans [`infrastructure/caddy/Caddyfile`](../../infrastructure/caddy/Caddyfile). PostgreSQL est un service persistant séparé. Les fichiers sont stockés dans un service objet compatible S3, avec des URLs temporaires.

```text
Internet → TLS/reverse proxy → API replicas → PostgreSQL
                                      └──────→ object storage
                                      └──────→ Mailcow (SMTP + IMAP support uniquement)
```

## Environnements

- `development` : services locaux et données jetables.
- `staging` : configuration proche de la production, données anonymisées.
- `production` : secrets gérés, sauvegardes et alertes obligatoires.

Les migrations sont exécutées par une étape contrôlée avant de rendre la nouvelle version disponible. Les replicas ne doivent pas dépendre d’un état local persistant.

Mailcow est un projet séparé sur le VPS partagé. L’API utilise un compte SMTP d’envoi dédié et, si nécessaire, un compte IMAP limité à `support@paranoiastudio.fr`. Elle ne reçoit pas de connexion SMTP entrante et n’a aucun accès aux boîtes personnelles.