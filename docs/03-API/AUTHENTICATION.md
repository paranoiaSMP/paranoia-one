 # API — AUTHENTIFICATION

## Flux

1. Le client crée un compte ou se connecte via HTTPS.
2. Le serveur vérifie les identifiants et crée une session révocable de 30 jours.
3. Le client conserve le token en stockage sécurisé et l’envoie avec `Authorization: Bearer`.
4. La déconnexion invalide la session côté serveur.

`GET /api/v1/me` vérifie le token côté serveur, refuse les sessions expirées ou révoquées et renvoie uniquement l’identifiant et l’email du compte courant.

Les sessions actives sont consultables via `GET /api/v1/auth/sessions`. Une session peut être révoquée via `DELETE /api/v1/auth/sessions/{id}`, ou toutes les autres sessions peuvent être révoquées avec `DELETE /api/v1/auth/sessions`.

Les tokens sont générés aléatoirement, transmis uniquement dans le corps de la réponse de connexion et ne sont jamais journalisés ou placés dans une URL. Seul leur hash SHA-256 est stocké en base.

## Exigences

- Mots de passe hachés avec Argon2id via les paramètres par défaut de la bibliothèque.
- Mot de passe de 12 à 128 caractères.
- Adresse email normalisée en minuscules avant stockage.
- Vérification d’adresse et récupération avec jetons à durée limitée, envoyées via le serveur mail officiel `@paranoiastudio.fr`.
- Limitation des tentatives et réponses non révélatrices pour un compte inconnu.
- Révocation par appareil et révocation globale.
- Rotation et invalidation après changement de mot de passe.

L’autorisation est toujours recalculée côté serveur, indépendamment de l’état affiché par le client.

## Réponses d’erreur

Une connexion avec un email absent ou un mot de passe incorrect renvoie la même réponse `401 invalid_credentials`. Une inscription en doublon renvoie `409 conflict` sans révéler le compte existant dans le message.

Les paramètres SMTP et l’adresse d’envoi sont fournis par l’environnement. Ils ne doivent jamais être exposés dans les réponses API, les logs ou les fichiers de configuration suivis.