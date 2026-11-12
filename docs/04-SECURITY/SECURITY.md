 # SÉCURITÉ

## Mesures obligatoires

- TLS en transit et chiffrement au repos fourni par l’infrastructure.
- Secrets dans un gestionnaire dédié, jamais dans Git.
- Requêtes SQL paramétrées et validation des entrées.
- Autorisation serveur sur chaque ressource.
- Limitation de débit sur l’authentification et les endpoints sensibles.
- Logs structurés sans tokens, mots de passe ni contenu privé inutile.
- Dépendances mises à jour et analysées dans la CI.
- Identifiants SMTP stockés dans le gestionnaire de secrets.
- Identifiants IMAP limités à `support@paranoiastudio.fr`.

Le socle HTTP applique déjà une limite de taille de requête de 1 MiB, des en-têtes de protection, la conversion des paniques et un tracing qui exclut la query string. L’authentification utilise Argon2id pour les mots de passe et des tokens de session aléatoires dont seul le hash est stocké. L’autorisation fine des ressources métier reste à ajouter.

Les emails de vérification et de récupération doivent être envoyés via SMTP TLS depuis une adresse `@paranoiastudio.fr`. Si la lecture des réponses est nécessaire, elle passe uniquement par IMAP TLS sur `support@paranoiastudio.fr`. Le backend n’a aucun accès aux boîtes personnelles. Les liens contiennent des tokens à durée limitée et à usage unique ; leur valeur ne doit jamais apparaître dans les logs.

## Vérification locale

Depuis [`backend/`](../../backend/) :

```bash
cargo fmt --all -- --check
cargo check --all-targets
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

Le backend ne doit pas être exposé directement sur Internet sans reverse proxy TLS, authentification, autorisation et limitation de débit adaptées aux routes métier.

## Cycle de sécurité

Les changements sensibles font l’objet d’une revue dédiée. Les vulnérabilités sont triées par impact, corrigées avec un test de non-régression et communiquées aux personnes concernées.

## Réponse à incident

Isoler le composant touché, préserver les journaux, révoquer les sessions ou secrets compromis, corriger la cause, puis vérifier la restauration et informer selon les obligations applicables.