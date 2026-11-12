 # SÉCURITÉ — PERMISSIONS

## Portées

- **Personal** : seul le propriétaire peut lire ou modifier ses données.
- **Workspace** : l’accès dépend de l’appartenance et du rôle.
- **Système** : réservé aux opérations d’exploitation explicitement autorisées.

## Rôles Pro cibles

| Rôle | Capacités |
|---|---|
| Owner | gestion du workspace, membres et facturation éventuelle |
| Admin | configuration et membres selon politique |
| Member | travail sur les ressources autorisées |
| Viewer | lecture sans mutation |

Chaque endpoint vérifie l’appartenance active, la permission requise et la portée de la ressource. Cacher un bouton dans l’interface ne remplace jamais ce contrôle.

Les changements de rôle, invitations et retraits sont audités.