 # API — ERREURS

Les erreurs utilisent une enveloppe stable :

```json
{
  "error": {
    "code": "validation_failed",
    "message": "La requête est invalide.",
    "request_id": "req_01..."
  }
}
```

`message` est destiné à l’utilisateur et ne contient ni stack trace ni secret. `code` est stable pour les clients ; `request_id` permet le diagnostic.

## Codes HTTP

| Statut | Usage |
|---|---|
| 400 | JSON ou paramètres invalides |
| 401 | session absente ou invalide |
| 403 | permission insuffisante |
| 404 | ressource absente ou non visible |
| 409 | conflit de version ou idempotence |
| 422 | validation métier |
| 429 | limitation de débit |
| 500 | erreur interne, sans détail sensible |

Les erreurs inattendues sont journalisées côté serveur avec leur contexte sûr et renvoient toujours une réponse générique.