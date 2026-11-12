 # ARCHITECTURE — DESKTOP

## Cible

L’application desktop est construite avec **Tauri 2** et **React**. Le frontend partage l'ensemble des composants, vues et design tokens de l'application web (`apps/web`), tandis que le shell Tauri (`apps/desktop/src-tauri`) fournit l’intégration native avec le système d’exploitation.

## Structure

```text
apps/desktop/
├── package.json               # Scripts dev et build Tauri
└── src-tauri/
    ├── Cargo.toml             # Dépendances Rust (tauri 2.x, plugins)
    ├── tauri.conf.json        # Configuration Tauri (fenêtre, id, chemins web)
    ├── build.rs
    ├── capabilities/          # Permissions Tauri 2
    ├── icons/                 # Icônes de l'application desktop
    └── src/
        ├── main.rs            # Point d'entrée binaire
        └── lib.rs             # Logique du shell et enregistrement des plugins
```

## Intégration avec le Web

Le shell Tauri utilise directement les assets générés par `apps/web` :
- En développement (`devUrl`) : `http://localhost:5173` avec rechargement à chaud (HMR).
- En production (`frontendDist`) : `../../web/dist`.

## Commandes

Depuis le dossier `apps/desktop` :

```bash
# Lancer l'application desktop en mode développement
npx @tauri-apps/cli dev

# Compiler le binaire natif Linux (AppImage, deb, etc.)
npx @tauri-apps/cli build

# Compiler l'exécutable Windows (.exe) depuis Linux
npm run build:windows
```

Pour la génération automatisée des installateurs Windows (.msi et .exe setup), le workflow GitHub Actions [`.github/workflows/desktop.yml`](../../.github/workflows/desktop.yml) compile nativement sur runner `windows-latest`.

## Responsabilités du shell

- Fenêtre, menus, notifications et cycle de vie.
- Stockage local chiffré des informations de session si disponible sur l’OS.
- Accès fichier limité aux commandes explicitement autorisées.
- Synchronisation en arrière-plan avec reprise après veille.

Le shell ne doit pas recevoir de secret applicatif inutile et ne doit pas contourner les permissions de l’API.

## Plateformes

Les builds ciblent Linux, Windows et macOS. Chaque cible doit être testée séparément pour les chemins de fichiers, notifications, mise à jour et gestion de fermeture.