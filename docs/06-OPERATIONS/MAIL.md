# OPÉRATIONS — SERVEUR MAIL

## Hébergement

Mailcow sera installé sur le VPS existant, qui héberge trois projets. Mailcow reste isolé des conteneurs applicatifs par réseau, comptes et secrets dédiés.

Le backend Paranoïa One ne reçoit pas les droits d’administration Mailcow et ne doit pas pouvoir accéder aux boîtes personnelles.

## Domaine

Paranoïa One utilise le domaine mail officiel :

```text
@paranoiastudio.fr
```

Les adresses applicatives et les boîtes personnelles de l’équipe utilisent ce domaine. Les adresses personnelles des utilisateurs finaux restent acceptées pour l’inscription lorsque le produit le nécessite ; elles ne doivent pas être confondues avec les comptes internes de Paranoïa Studio.

## Usages applicatifs

Le backend enverra notamment :

- les vérifications d’adresse ;
- la récupération de compte ;
- les alertes de sécurité ;
- les invitations workspace ;
- les notifications importantes.

L’adresse d’envoi applicative sera `no-reply@paranoiastudio.fr`. Elle est réservée à l’envoi et ne doit pas être utilisée pour recevoir des réponses.

La boîte `support@paranoiastudio.fr` est la boîte officielle de réception pour le support et les communications d’équipe. Elle est accessible via le Webmail intégré dans l’espace Pro de l’application web (`#mail`) et peut être lue via IMAP par le backend si le traitement automatisé des réponses est activé. Cet accès est strictement limité à cette boîte technique et ne s’étend à aucune boîte personnelle.

```text
Espace Pro (Webmail in-app) → support@paranoiastudio.fr (lecture / réponse)
Backend → SMTP : no-reply@paranoiastudio.fr
Backend → IMAP : support@paranoiastudio.fr uniquement
Backend → boîtes personnelles : interdit
```

## Configuration cible

Le fournisseur et les noms d’hôtes restent à confirmer. Ils seront injectés par secrets, jamais écrits dans le dépôt :

```text
MAIL_SMTP_HOST
MAIL_SMTP_PORT
MAIL_SMTP_USERNAME
MAIL_SMTP_PASSWORD
MAIL_FROM_ADDRESS
MAIL_FROM_NAME
MAIL_REPLY_TO
MAIL_IMAP_HOST
MAIL_IMAP_PORT
MAIL_IMAP_USERNAME
MAIL_IMAP_PASSWORD
```

Le backend doit utiliser SMTP et IMAP avec TLS. Les identifiants IMAP doivent appartenir uniquement à `support@paranoiastudio.fr`. Le port, le mode TLS et les limites d’envoi doivent suivre la configuration Mailcow.

## État de l'implémentation

Le module `backend/src/mail.rs` envoie du texte brut en UTF-8 par SMTP, en tâche de fond: un échec SMTP est journalisé (sans le contenu) mais ne fait jamais échouer l'action de l'utilisateur.

- Activation: `MAIL_SMTP_HOST` et `MAIL_FROM_ADDRESS` sont obligatoires. Sans eux, l'envoi est désactivé et l'API démarre quand même.
- Optionnels: `MAIL_SMTP_PORT`, `MAIL_SMTP_USERNAME` + `MAIL_SMTP_PASSWORD`, `MAIL_FROM_NAME`, `MAIL_REPLY_TO`.
- `MAIL_SMTP_TLS`: `starttls` (défaut), `implicit` (port 465) ou `none` (développement local avec un serveur de capture comme Mailpit, jamais en production).
- Envoyé aujourd'hui: invitation à une équipe. Pas encore: vérification d'adresse, récupération de compte, alertes de sécurité, lecture IMAP de `support@`.

## DNS et délivrabilité

Avant la production, configurer et vérifier :

- `MX` pour la réception du domaine ;
- `SPF` pour autoriser le serveur d’envoi ;
- `DKIM` pour signer les messages ;
- `DMARC` avec une politique adaptée ;
- `PTR`/reverse DNS si le serveur est auto-hébergé ;
- `TLS` valide pour SMTP.

Les tests doivent utiliser une boîte de staging. Aucun envoi de masse ou test vers des données réelles ne doit être effectué depuis le développement.

## Sécurité et exploitation

- Ne jamais journaliser le mot de passe SMTP, les tokens de vérification ou le contenu complet des emails.
- Ne jamais fournir au backend un compte administrateur Mailcow ou un identifiant IMAP personnel.
- Utiliser des comptes techniques différents pour SMTP et IMAP si Mailcow le permet.
- Utiliser des tokens à usage unique et à durée limitée pour les liens sensibles.
- Limiter les tentatives d’envoi par compte, IP et adresse destinataire.
- Mesurer les erreurs SMTP, les rejets et les délais de livraison.
- Révoquer immédiatement les identifiants en cas de fuite.
- Prévoir une adresse de contact pour les abus et les retours de délivrabilité.

Tout accès humain aux boîtes personnelles reste géré séparément par Mailcow et le VPS. Un accès exceptionnel doit être approuvé, limité dans le temps, journalisé et notifié au propriétaire de la boîte.
