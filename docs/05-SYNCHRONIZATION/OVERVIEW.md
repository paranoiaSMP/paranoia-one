 # SYNCHRONISATION — VUE D’ENSEMBLE

La synchronisation permet aux clients de conserver un cache local et de travailler avec une connectivité intermittente.

## Flux

1. Le client stocke le dernier curseur serveur.
2. Il envoie ses mutations avec un identifiant unique et la version observée.
3. Le serveur valide l’identité, la permission et la version.
4. Le client récupère les changements depuis son curseur.
5. Le client applique les changements dans une transaction locale.

Les opérations sont ordonnées par curseur serveur, pas par l’horloge de l’appareil. Les mutations déjà reçues sont reconnues comme idempotentes.

## Limites

Les règles d’accès sont évaluées en ligne. Une donnée retirée du workspace est supprimée du cache dès que le client reçoit l’événement de révocation.