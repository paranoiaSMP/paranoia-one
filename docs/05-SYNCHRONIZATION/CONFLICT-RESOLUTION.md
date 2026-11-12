 # SYNCHRONISATION — CONFLITS

Un conflit survient lorsqu’une mutation repose sur une version qui n’est plus la version courante.

## Stratégie

- Champs indépendants : fusion automatique si elle est sûre.
- Texte ou contenu éditorial : conserver les versions et demander une décision.
- Statuts, permissions et suppressions : priorité au serveur ou résolution explicite.
- Toute résolution produit un nouvel événement synchronisable.

Le serveur renvoie `409` avec l’identifiant de ressource, la version courante et les informations nécessaires, sans exposer de données auxquelles le client n’a plus accès.

Le client ne doit jamais écraser silencieusement une modification distante. Les conflits non résolus sont visibles et réessayables.