# Architecture mobile

Android et iOS utilisent le shell Tauri 2 dans `apps/desktop`, avec le même frontend React que les versions web et desktop. Cette base évite de maintenir une deuxième interface divergente.

Les configurations `tauri.android.conf.json` et `tauri.ios.conf.json` adaptent la fenêtre mobile. La vue téléphone utilise les zones sûres et des contrôles tactiles. Les paquets embarquent l’interface mais se connectent au serveur HTTPS pour les données : ils ne fournissent pas de synchronisation hors ligne ni de stockage natif chiffré supplémentaires.

Les procédures et les limites de signature sont dans [Applications installables](../06-OPERATIONS/INSTALLABLE-APPS.md).
