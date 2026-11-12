 # OPÉRATIONS — DÉVELOPPEMENT

## Prérequis

- Rust stable compatible avec [`backend/Cargo.toml`](../../backend/Cargo.toml).
- Cargo et Git.
- PostgreSQL et stockage objet pour les fonctionnalités correspondantes lorsqu’elles seront implémentées.

## Démarrage du backend

```bash
cd backend
cargo check
cargo test
cargo run
```

Le serveur écoute par défaut sur `127.0.0.1:8080`. Vérifier son état avec :

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/ready
curl http://127.0.0.1:8080/api/v1/status
```

Configurer PostgreSQL avec une URL injectée par l’environnement, puis démarrer :

```bash
DATABASE_URL='postgres://user:password@localhost:5432/paranoia' cargo run
```

Modifier l’écoute et le niveau de logs avec `BIND_ADDRESS` et `RUST_LOG`. Ne pas placer une URL contenant un vrai mot de passe dans un fichier suivi par Git.

## Validation avant changement

```bash
cargo fmt --all -- --check
cargo check --all-targets
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

Le backend dispose maintenant du socle PostgreSQL, des tables d’identité et des routes d’inscription, connexion et déconnexion. Les routes métier documentées comme « prévues » ne doivent pas être considérées comme disponibles.

## Règles de travail

- Une branche par changement cohérent.
- Tests et documentation mis à jour avec le comportement.
- Pas de secret dans les fichiers suivis.
- Migrations testées sur base vide et existante.