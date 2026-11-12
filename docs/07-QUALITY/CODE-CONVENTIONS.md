 # QUALITÉ — CONVENTIONS DE CODE

## Général

- Noms explicites et modules limités à une responsabilité.
- Validation aux frontières, invariants dans le domaine.
- Erreurs typées et contextualisées ; pas de `unwrap` sur une entrée externe.
- Aucun secret ou contenu privé dans les logs.
- Préférer les helpers partagés aux duplications.

## Rust

Utiliser `cargo fmt`, `cargo check` et `cargo clippy` dans la CI. Propager les erreurs avec un type applicatif commun et convertir les erreurs internes en réponses publiques contrôlées.

## API et données

Versionner les changements de contrat, utiliser des requêtes paramétrées, borner la pagination et écrire les timestamps en UTC. Toute mutation sensible doit avoir un test d’autorisation.