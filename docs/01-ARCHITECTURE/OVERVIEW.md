# PARANOÏA ONE — SYSTEM ARCHITECTURE OVERVIEW

**Product:** Paranoïa One  
**Publisher:** Paranoïa Studio  
**Version:** 1.0  
**Status:** Draft

---

## 1. Architecture Overview

Paranoïa One follows a client-server architecture.

The system consists of three client applications, one centralized backend and shared infrastructure services.

### Client Applications

1. Web — React + TypeScript + Vite.
2. Phone — React Native.
3. Desktop — Tauri 2 + React.

All clients communicate with the same backend API.

### Backend

- Language: Rust.
- HTTP framework: Axum.
- Async runtime: Tokio.
- Database access: SQLx.
- Database: PostgreSQL.

The backend owns business logic, authentication, authorization and data consistency.

---

## 2. High-Level Architecture

```text
                  PARANOÏA ONE CLIENTS

       WEB             PHONE            DESKTOP
    React/Vite       React Native      Tauri/React
       |                 |                 |
       +-----------------+-----------------+
                         |
                   HTTPS / WSS
                         |
                  RUST BACKEND
                       Axum
                         |
             +-----------+-----------+
             |           |           |
          Auth       Business      Sync
          Module      Modules      Module
             |           |           |
             +-----------+-----------+
                         |
                    SQLx / SQL
                         |
                    PostgreSQL
                         |
             +-----------+-----------+
             |                       |
         File Storage            Background
                                  Workers
```

---

## 3. Backend Responsibilities

The backend is the central authority of the system.

It is responsible for:

- User authentication.
- Session management.
- Authorization.
- Personal data management.
- Workspace management.
- Project and task management.
- Notifications.
- File access.
- Synchronization.
- Data validation.
- Business rules.

Clients must never be trusted to enforce security independently.

---

## 4. Client Responsibilities

### 4.1 Web

The Web application provides browser-based access.

Responsibilities:
- User interface.
- API communication.
- Client-side navigation.
- Form validation.
- Session presentation.
- Responsive layouts.

### 4.2 Phone

The Phone application provides a native mobile experience.

Responsibilities:
- Mobile interface.
- Native device integrations.
- Local data access.
- Push notification integration.
- Offline interaction.
- API communication.

### 4.3 Desktop

The Desktop application uses Tauri 2 and React.

Responsibilities:
- Desktop interface.
- Native operating system integrations.
- Local data access.
- Desktop notifications.
- Offline interaction.
- API communication.

---

## 5. Data Architecture

### Central Database

PostgreSQL stores authoritative application data.

It contains:
- User accounts.
- Personal spaces.
- Workspaces.
- Workspace members.
- Roles and permissions.
- Projects.
- Tasks.
- Notes.
- Calendar events.
- Notifications.
- File metadata.

### Local Databases

SQLite may be used by Phone and Desktop for offline access.

Local databases are not authoritative.

Changes made offline must be synchronized with the backend.

Web offline storage will use browser-supported storage, such as IndexedDB.

---

## 6. API Architecture

The backend exposes a versioned REST API.

Base path:

`/api/v1`

Communication format:
- JSON.
- HTTPS in production.
- WebSocket for selected real-time features.

API contracts must remain consistent across all clients.

---

## 7. Synchronization Architecture

Synchronization is based on client-server communication.

The system must support:

- Local pending changes.
- Change tracking.
- Synchronization requests.
- Server-side validation.
- Conflict detection.
- Conflict resolution.
- Retry after network failure.

The server remains the final authority for shared data and permissions.

---

## 8. Security Boundaries

- Authentication is centralized.
- Authorization is enforced by the backend.
- Personal data is private by default.
- Workspace access requires membership and appropriate permissions.
- Local storage must protect sensitive information.
- Communication must use HTTPS in production.
- File access must be authorized by the backend.

---

## 9. Infrastructure

Initial infrastructure:

- Linux VPS.
- Rust backend service.
- PostgreSQL.
- Reverse proxy.
- HTTPS certificates.
- File storage.
- Backup system.
- Monitoring and logs.

Docker may be used to manage deployment and dependencies.

---

## 10. Architectural Principles

1. One centralized backend.
2. Three independent client applications.
3. Shared API contracts.
4. Clear separation of business domains.
5. Server-side authorization.
6. Privacy by default.
7. Offline capability designed from the beginning.
8. Modular and maintainable code.
9. Versioned APIs and migrations.
10. No premature microservices.
 # ARCHITECTURE — VUE D’ENSEMBLE

## État actuel

Le dépôt contient actuellement un crate Rust minimal dans [`backend/`](../../backend/). Le point d’entrée est [`backend/src/main.rs`](../../backend/src/main.rs) et n’expose pas encore d’API.

## Architecture cible

```text
Web / Desktop / Phone
          │ HTTPS + JSON
          ▼
      API Axum
          │
   Services métier
          │
 PostgreSQL ── stockage fichiers
          ▲
 Clients locaux : SQLite + file de synchronisation
```

Le backend est l’autorité pour l’identité, les permissions et les données partagées. Les clients peuvent mettre en cache des données et préparer des mutations hors ligne, mais ne peuvent pas décider seuls d’une autorisation.

## Principes

- Séparer les domaines Personal et Pro au niveau des modèles et des contrôles d’accès.
- Conserver des contrats API versionnés et compatibles avec les clients déployés.
- Utiliser des identifiants opaques et des timestamps UTC.
- Centraliser validation, erreurs, pagination et observabilité.
- Rendre les opérations idempotentes lorsqu’elles peuvent être rejouées.

## Modules logiques

| Module | Responsabilité |
|---|---|
| Identity | comptes, sessions, vérification et récupération |
| Personal | notes, tâches, calendrier, habitudes et objectifs |
| Workspace | membres, invitations, rôles et paramètres |
| Collaboration | projets, commentaires, annonces et activité |
| Sync | curseurs, versions, mutations et conflits |
| Files | métadonnées, téléchargement et contrôle d’accès |

Les modules restent indépendants des frameworks de présentation afin de pouvoir être testés sans serveur HTTP.