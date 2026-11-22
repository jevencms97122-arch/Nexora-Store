# Nexora Store

Un store minimaliste façon Play Store pour PC (Windows), sans compte, pour publier et installer des jeux et des applications.
Construit avec **Tauri 2** (Rust) + **React / TypeScript**, **Tailwind CSS** et **Motion** pour les animations.

## Lancer

```bash
npm install
npm run tauri dev      # l'application complète
npm run dev            # l'interface seule dans un navigateur, avec des données de démo
npm run tauri build    # installeur .exe (NSIS) dans src-tauri/target/release/bundle
```

## Fonctionnement (mode local)

- **Ajouter** : bouton « Ajouter » ou glisser-déposer un `.exe`, `.msi` ou `.zip` (et des images) dans la fenêtre.
- **Installer** : un `.zip` est extrait, un `.exe` / `.msi` est copié ; « Ouvrir » lance l'exécutable depuis son dossier.
- Données dans `%APPDATA%/com.nexora.store/` :
  - `nexora.db` : catalogue SQLite (`apps`) et installations (`installs`)
  - `library/<id>/` : fichier de l'app, icône, captures
  - `installed/<id>/` : app installée

## Structure

```
src/
  providers/   StoreProvider (interface), LocalProvider (SQLite), DemoProvider (navigateur)
  state/       store, navigation, thème, notifications
  pages/       Discover, AppDetail, Library, SearchResults, AppForm, Settings
  components/  TopBar, Hero, Row, AppCard, AppIcon, InstallButton, Modal, ui
src-tauri/src/
  commands.rs  import, installation (avec progression), lancement, désinstallation
  lib.rs       plugins (sql, dialog, opener) et schéma SQLite
```

## Passer à PocketBase

L'interface ne parle qu'à `StoreProvider`. Il suffira d'ajouter un `PocketBaseProvider`
(collection `apps` aux mêmes champs) et de le sélectionner dans les paramètres ;
les installations restent locales (`LocalInstallService`).
