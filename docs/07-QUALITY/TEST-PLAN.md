 # QUALITÉ — PLAN DE TEST

## Pyramide

| Niveau | Couvre |
|---|---|
| Unitaire | règles métier, permissions et résolution de conflits |
| Intégration | repositories, migrations et transactions |
| Contrat | schémas JSON et compatibilité client/API |
| End-to-end | flux critiques sur chaque plateforme |

## Parcours critiques

- inscription, vérification, connexion et révocation ;
- isolation Personal/Pro et contrôle de rôle ;
- création, modification et pagination des ressources ;
- expiration de session et erreurs réseau ;
- mutation hors ligne, reconnexion et conflit ;
- upload/download avec permissions ;
- sauvegarde et restauration.

Les tests doivent vérifier les erreurs et les limites, pas seulement le chemin nominal. Toute correction de bug ajoute un test de non-régression. Les tests de performance utilisent des données représentatives sans données personnelles réelles.