# Spécification Technique - Audiolab v3.0

Bienvenue dans la spécification technique d'**Audiolab (v3.0)**, une plateforme d'analyse acoustique et d'audit de relation client (Customer Experience - CX) assistée par l'intelligence artificielle Gemini et sécurisée via Firebase Firestore. 

---

## 1. Vue d'ensemble de l'Architecture

L'application repose sur un couplage moderne entre un client riche (Single Page Application - SPA) et un serveur applicatif customisé (Express/Node.js), enrichi par l'écosystème Cloud de Firebase.

```mermaid
graph TD
    Client[SPA React 19 / Tailwind v4] -->|1. Envoi WAV (Base64)| Express[Serveur Express server.ts]
    Express -->|2. Upload WAV| FilesAPI[Gemini Files API]
    Express -->|3. Requête d'Analyse (JSON Schema)| Gemini[Modèles Gemini 3.5-flash / Fallbacks]
    Gemini -->|4. Analyse Structurée| Express
    Express -->|5. Résultat d'Analyse (JSON)| Client
    Client -->|6. Authentification Google| FirebaseAuth[Firebase Authentication]
    Client -->|7. Archivage & Temps Réel| Firestore[Cloud Firestore]
```

### Stack Technologique Core
*   **Frontend :** React 19.0.1, TypeScript 5.8.2, Tailwind CSS 4.1.14 (compilé via `@tailwindcss/vite`), Motion (Framer) 12.23.24 pour les micro-animations, et Lucide React pour les icônes.
*   **Serveur Applicatif :** Express 4.21.2 sous runtime Node.js, développé en TypeScript et exécuté à la volée via `tsx` (TypeScript Execute) en mode développement, ou packagé sous format CJS optimisé via `esbuild` pour la production.
*   **Moteur d'IA :** SDK officiel `@google/genai` (v2.4.0) exploitant la suite de modèles Gemini de Google avec support natif du typage structuré et du mode "Thinking" (raisonnement logique).
*   **Backend Cloud & Données :** Suite Google Firebase v12.14.0 (Auth + Firestore NoSQL) avec intégration stricte des règles de sécurité au niveau de la base de données.

---

## 2. Pipeline de traitement de l'IA (Gemini API)

Le traitement des fichiers audio WAV est asynchrone et structuré afin de supporter des fichiers volumineux (jusqu'à 40 Mo au niveau du serveur, extensibles architecturalement).

### 2.1 Cycle de vie d'une tâche d'analyse
1. **Soumission (POST `/api/analyze`)** : Le client envoie le signal audio encodé en Base64 ainsi que le nom du fichier. Le serveur génère instantanément un identifiant unique de tâche (`task_xxxxxx`) et retourne un code statut `202 Accepted` pour décharger le socket réseau.
2. **Archivage Temporaire Local** : Le serveur Express décode la chaîne Base64 en fichier physique binaire `.wav` localisé dans le dossier système `/tmp` de l'hôte.
3. **Téléversement Files API** : Pour éviter l'épuisement de mémoire et supporter des signaux longs, le serveur téléverse le fichier audio vers l'API **Gemini Files** (`ai.files.upload`) sous format `audio/wav`.
4. **Analyse Poly-Modèle avec Résilience (Fallback)** :
   Le pipeline tente d'exécuter l'analyse acoustique à l'aide de trois modèles de manière séquentielle en cas d'erreur de charge ou d'épuisement de quota (Erreurs temporaires 429/503) :
   *   **Modèle Principal** : `gemini-3.5-flash` (avec mode de raisonnement `ThinkingLevel.LOW` activé pour augmenter la rigueur algorithmique).
   *   **Premier Secours** : `gemini-3.1-pro-preview` (pour des traitements linguistiques de très haute précision).
   *   **Second Secours** : `gemini-2.5-flash` (pour une rapidité et une efficacité brute).
5. **Formatage Structuré (JSON Schema)** :
   L'API Gemini est contrainte de retourner un flux JSON rigoureusement typé via un schéma spécifié au serveur (voir section 3.2).
6. **Nettoyage Automatique des Ressources** :
   Qu'il y ait succès ou échec, le système procède à un nettoyage strict des traces binaires :
   *   Suppression du fichier WAV local dans `/tmp` pour économiser l'espace disque.
   *   Suppression du fichier audio distant sur les serveurs temporaires de Gemini via l'appel `ai.files.delete` pour garantir la confidentialité absolue des données de l'utilisateur.

---

## 3. Schéma et Modèles de Données

Les données manipulées au sein de l'application sont modélisées en TypeScript côté client/serveur, modélisées en JSON Schema pour l'API Gemini, et stockées en base de données Firestore.

### 3.1 Définitions des Interfaces TypeScript (`src/types.ts`)

```typescript
export interface AudioTurn {
  speaker: string;           // Identifiant du locuteur (ex: "Locuteur A", "Agent GE CX")
  startTime: number;         // Timestamp de début en secondes (ex: 1.5)
  endTime: number;           // Timestamp de fin en secondes (ex: 5.4)
  text: string;              // Transcription textuelle en français
  noiseBackground: string;   // Description des bruits parasites durant ce tour
  audioQualityScore: number; // Note technique de clarté vocale du tour (1 à 10)
  audioQualityNotes: string; // Commentaires techniques individuels
}

export interface CxDetection {
  description: string;       // Nature de l'écart ou de la digression
  severity: "low" | "medium" | "high"; // Gravité de l'anomalie détectée
  contextText?: string;      // Extrait textuel ou phrase exacte concernée
}

export interface AudioAnalysisOverall {
  score: number;                      // Note de qualité acoustique globale (1.0 à 10.0)
  summary: string;                    // Résumé synthétique de la conversation (Max 10Ko)
  noiseTypes: string[];               // Liste des types de bruits identifiés
  strengths: string[];                // Forces identifiées
  weaknesses: string[];               // Faiblesses acoustiques ou techniques
  recommendations: string[];          // Recommandations d'amélioration (Max 30 éléments)
  agentHallucinations?: CxDetection[];     // Audit CX : Détection d'affirmations infondées
  agentRepeatedQuestions?: CxDetection[];  // Audit CX : Questions répétitives/redondantes
  userOutofScopeSteering?: CxDetection[];  // Audit CX : Digressions/Sorties du cadre de service
}

export interface AudioAnalysis {
  turns: AudioTurn[];
  overallQuality: AudioAnalysisOverall;
}
```

---

## 4. Spécifications de Sécurité & Règles Firestore

Pour garantir l'intégrité de la base de données sans surcharger les performances, Audiolab utilise une validation stricte décentralisée au niveau de la couche d'accès aux données Cloud Firestore (`firestore.rules`).

### 4.1 Principes de Sécurité Invariants
1. **Authentification Obligatoire** : Aucun accès anonyme n'est autorisé en écriture ou en lecture sur les ressources d'analyse.
2. **Email Vérifié Requis** : Pour toute création ou mise à jour, l'adresse email de l'utilisateur Firebase authentifié doit être validée (`request.auth.token.email_verified == true`).
3. **Contrôle d'Identité Strict (Identity Guard)** : Le champ `ownerId` d'un document Firestore doit correspondre impérativement au UID de l'utilisateur authentifié (`request.auth.uid`), empêchant l'injection de données usurpant l'identité d'un tiers.
4. **Intégrité Temporelle** : Le champ `createdAt` doit être lié à la variable système `request.time` (Server Timestamp) lors de la création d'un document et est rendu strictement **immutable** lors des mises à jour ultérieures.
5. **Limitation du Périmètre des Mises à Jour (Write Budget)** : Les utilisateurs ne peuvent modifier *uniquement* que le champ `fileName` d'un rapport existant. Le reste des données analytiques (les tours de parole, les scores, les synthèses de conformité) est protégé contre toute altération post-génération.
6. **Défense contre le Denial of Wallet (Poisoning & Exhaustion)** :
   *   Limitation de la taille des tableaux de dialogues (`turns`) à un maximum strict de **100 éléments**.
   *   Limitation de la taille de la synthèse textuelle (`overallQuality.summary`) à un maximum de **10 Ko**.
   *   Encadrement des scores acoustiques globaux entre **1.0 et 10.0**.
   *   Encadrement des listes de métadonnées (bruits, forces, recommandations) à **30 éléments** maximum.
7. **Anti-Scraping (No Client Delegation)** : Les requêtes de listage général (`list`) ou d'accès unitaire (`get`) sans filtre restrictif sur le champ `ownerId` sont systématiquement bloquées.

---

## 5. Spécifications des Endpoints de l'API Express

Le serveur Express expose des endpoints REST spécifiques préfixés par `/api`. Les requêtes hors-périmètre ou malformées sont rejetées sous format JSON propre (et non sous forme de pages d'erreur HTML).

### 5.1 POST `/api/analyze`
*   **Description** : Initialise le pipeline asynchrone d'analyse acoustique.
*   **Payload d'Entrée (JSON)** :
    ```json
    {
      "audioData": "data:audio/wav;base64,UklGR...", // Chaîne audio WAV encodée en base64
      "fileName": "enregistrement.wav"             // Nom du fichier optionnel
    }
    ```
*   **Codes de Retour** :
    *   `202 Accepted` : Tâche planifiée en arrière-plan.
        ```json
        {
          "taskId": "task_1717315582987_ab3z4y5x",
          "status": "pending",
          "message": "Tâche d'analyse démarrée en arrière-plan..."
        }
        ```
    *   `400 Bad Request` : Fichier audio manquant ou flux malformé.
    *   `500 Internal Server Error` : Clé d'API Gemini manquante ou panne système.

### 5.2 GET `/api/analyze/status/:taskId`
*   **Description** : Récupère le statut en temps réel d'une tâche d'analyse.
*   **Codes de Retour** :
    *   `200 OK` : Renvoie l'état courant de la tâche.
        ```json
        {
          "id": "task_1717315582987_ab3z4y5x",
          "fileName": "enregistrement.wav",
          "status": "processing", // "pending" | "processing" | "completed" | "failed"
          "progress": 50,         // Pourcentage de progression (0 à 100)
          "currentModel": "gemini-3.5-flash",
          "retryStatus": "En cours d'exécution de l'analyse acoustique...",
          "createdAt": 1717315582987,
          "updatedAt": 1717315589000,
          "result": { ... },     // Présent uniquement si status == "completed" (Type AudioAnalysis)
          "error": "..."          // Présent uniquement si status == "failed"
        }
        ```
    *   `404 Not Found` : Identifiant de tâche invalide ou expiré de la mémoire vive du serveur (durée de rétention des tâches en mémoire : **2 heures**).

### 5.3 GET `/api/health`
*   **Description** : Point de contrôle de disponibilité de l'application (Health Check).
*   **Format de retour** : `{"status": "ok", "mode": "development"}`
