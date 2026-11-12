# Applications installables — Paranoïa One

Les clients Linux, Windows, Android et iOS partagent le frontend `apps/web` et le shell Tauri 2 de `apps/desktop`. Le serveur ne fait pas partie du paquet installé. Les fonctionnalités Mail restent limitées tant que la réception et l’envoi ne sont pas raccordés au backend.

## Installation des dépendances JavaScript

Depuis la racine du dépôt :

```sh
npm ci --prefix apps/web
npm ci --prefix apps/desktop
```

## Serveur utilisé

Les paquets utilisent `apps/web/.env.production`, actuellement `https://api.paranoiastudio.fr`. Sur un téléphone, `127.0.0.1` désigne le téléphone, pas le PC. Garder une API HTTPS accessible depuis les appareils.

Le backend doit accepter les origines natives exactes `tauri://localhost`, `http://tauri.localhost` et `https://tauri.localhost`. La configuration Rust locale les inclut. Le reverse proxy doit laisser passer OPTIONS et les réponses CORS de l’API. Ne pas désactiver la vérification TLS ou utiliser une origine universelle pour contourner un refus.

## Linux

```sh
cd apps/desktop
npm run build:linux
```

Les paquets `.deb` et `.AppImage` sont générés dans `src-tauri/target/release/bundle/`. Le `.deb` dépend des bibliothèques WebKitGTK de la distribution. Une AppImage doit être rendue exécutable avant son lancement.

## Windows

Sur Windows, avec les outils C++ de Microsoft et WebView2 :

```sh
cd apps/desktop
npm run build
```

Depuis Linux, avec cargo-xwin, le SDK Windows et llvm-rc :

```sh
npm run build:windows
```

Cette dernière commande produit un exécutable, pas un installateur. Le workflow desktop fournit les installateurs Windows sur un runner Windows. Les exécutables ne sont pas signés avec un certificat de publication.

## Android

Installer un JDK (Java 21 ou 25), le SDK Android, la plateforme 36, build-tools 36.0.0 et NDK 27.2.12479018. L’acceptation des licences Google relève du propriétaire de la machine.

```sh
cd apps/desktop
source scripts/android-env.sh
rustup target add aarch64-linux-android
npm run android:debug
```

L’APK de test ARM64 est dans `src-tauri/gen/android/app/build/outputs/apk/`. Il est signé avec une clé de développement, pour installation et essais manuels, pas pour publication sur Google Play. Pour publier, créer une clé de signature privée pérenne, la garder hors du dépôt, configurer Gradle et utiliser `npm run android:apk`.

## iPhone

La génération Xcode et la compilation iOS s’exécutent sur macOS avec Xcode. Aucun IPA installable sur iPhone ne peut être produit ici sans cet environnement et les éléments de signature Apple.

```sh
cd apps/desktop
npm run ios:init
npm run ios:dev
# Pour un appareil réel / une archive :
npm run ios:build -- --open
```

Dans Xcode, sélectionner l’équipe Apple et l’iPhone de test. Pour une distribution TestFlight/App Store, configurer certificats et profils Apple. Ne pas stocker les certificats privés dans Git. `tauri.ios.conf.json` adapte la fenêtre au format téléphone.

Références : https://v2.tauri.app/start/prerequisites/ et https://v2.tauri.app/distribute/app-store/.
