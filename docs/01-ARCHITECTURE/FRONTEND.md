 # ARCHITECTURE — FRONTEND WEB

## État

L’application web n’est pas encore présente dans le dépôt. La cible est React + TypeScript.

## Structure cible

```text
apps/web/
├── src/
│   ├── app/             # routage, providers et bootstrap
│   ├── features/        # écrans organisés par domaine
│   ├── components/      # composants partagés
│   ├── api/             # client HTTP généré ou typé
│   └── state/           # session et cache serveur
└── public/
```

Le client ne duplique pas les règles d’autorisation : il masque les actions indisponibles pour l’UX, tandis que le backend reste la source de vérité.

## Principes UI

- Responsive dès la conception.
- Navigation clavier et focus visible.
- États explicites : chargement, vide, erreur et succès.
- Mutations idempotentes lorsque possible.
- Cache invalidé après une mutation confirmée par l’API.

Les contrats partagés avec le backend doivent être versionnés dans [`packages/`](../../packages/) lorsqu’ils seront ajoutés.