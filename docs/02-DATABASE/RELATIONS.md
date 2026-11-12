 # BASE DE DONNÉES — RELATIONS

```text
users ──< sessions
users ──< workspace_members >── workspaces
workspaces ──< projects ──< tasks
users ──< notes
users ──< calendar_events
tasks ──< comments
resources ──< files
```

## Règles d’intégrité

- Un membre référence un utilisateur et un workspace existants.
- Le rôle d’un membre est valide selon un enum ou une table de rôles versionnée.
- Une ressource Pro référence son workspace ; toute lecture filtre par ce workspace.
- Une tâche assignée ne peut l’être qu’à un membre du workspace concerné.
- Les fichiers utilisent une référence de ressource et vérifient l’autorisation avant téléchargement.

Les contraintes de clés étrangères sont préférées aux contrôles applicatifs seuls. Les suppressions en cascade sont limitées aux données strictement dépendantes ; les données d’audit sont conservées selon la politique de rétention.