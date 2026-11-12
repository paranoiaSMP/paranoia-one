 # OPÉRATIONS — MONITORING

## Signaux

- Disponibilité et résultat du health check.
- Latence et taux d’erreur par route.
- Saturation CPU, mémoire, pool PostgreSQL et stockage.
- Taille de la file de synchronisation et taux de conflits.
- Échecs de jobs, sauvegardes et migrations.

## Observabilité

Chaque requête porte un `request_id`. Les logs sont structurés, corrélables et exempts de données privées. Les métriques sont agrégées ; les traces ne capturent pas le contenu des notes ou messages.

Les alertes doivent être actionnables, documentées et testées. Un tableau de bord opérationnel accompagne chaque service de production.