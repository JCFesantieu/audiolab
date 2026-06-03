# Guide d'Installation et de Démarrage - Audiolab v3.0

Ce guide fournit toutes les étapes nécessaires pour configurer, installer, sécuriser et exécuter l'application **Audiolab** en local et en production.

---

## 1. Prérequis Système

Assurez-vous de disposer des outils suivants sur votre machine locale :
*   **Runtime** : Node.js (version LTS `v18.x` ou supérieure recommandée)
*   **Gestionnaire de paquets** : `npm` (inclus par défaut avec Node.js)
*   **Accès Internet** : Requis pour interroger les API de Google Gemini et se connecter aux serveurs Cloud Firebase.

---

## 2. Procédure d'Installation

### Étape 2.1 : Cloner et installer les dépendances
Ouvrez votre terminal et placez-vous à la racine du projet, puis exécutez la commande d'installation des dépendances :
```bash
npm install
```
Cette commande va configurer l'ensemble des modules requis spécifiés dans le fichier `package.json`, notamment les bibliothèques de compilation de style `@tailwindcss/vite`, Framer Motion (`motion`), le framework `express` et le SDK `@google/genai`.

---

## 3. Configuration des Variables d'Environnement

L'application requiert une clé d'API Google Gemini valide pour réaliser l'analyse audio intelligente.

### Étape 3.1 : Configurer le fichier d'environnement
1.  Faites une copie du fichier d'exemple fourni `.env.example` et renommez-le en `.env` à la racine de votre projet :
    ```bash
    cp .env.example .env
    ```
2.  Ouvrez le fichier `.env` nouvellement créé et renseignez votre clé d'API Google AI Studio :
    ```env
    GEMINI_API_KEY="VOTRE_CLE_API_GEMINI_ICI"
    ```
    *(Pour obtenir une clé d'API gratuite, visitez la console [Google AI Studio](https://aistudio.google.com/)).*

---

## 4. Intégration de la Base de Données Cloud (Firebase)

Audiolab intègre une couche de sauvegarde dans le Cloud à l'aide de Firebase. 

### Étape 4.1 : Configurer votre Applet (firebase-applet-config.json)
Pour connecter l'application à votre propre projet Firebase, renommez le fichier exemple `firebase-applet-config.json.example` en `firebase-applet-config.json` et renseignez-y vos identifiants Firebase (obtenus dans les paramètres de votre projet sur la console Firebase) :
```json
{
  "projectId": "VOTRE_PROJET_FIREBASE_ID",
  "appId": "VOTRE_APP_ID",
  "apiKey": "VOTRE_API_KEY",
  "authDomain": "VOTRE_PROJET_FIREBASE_ID.firebaseapp.com",
  "firestoreDatabaseId": "VOTRE_DATABASE_ID",
  "storageBucket": "VOTRE_PROJET_FIREBASE_ID.firebasestorage.app",
  "messagingSenderId": "VOTRE_SENDER_ID",
  "measurementId": ""
}
```
*   **Authentification** : Gérée via Google Sign-In (fenêtre contextuelle active côté client).
*   **Firestore Database** : Gérée via l'instance spécifique que vous configurez.

### Étape 4.2 : Sécurité de la Base de Données (Production)
Pour appliquer les règles de sécurité strictes définies dans `firestore.rules` sur votre console Firebase locale ou de production :
1.  Installez les outils CLI Firebase en local (optionnel) :
    ```bash
    npm install -g firebase-tools
    ```
2.  Connectez-vous à votre compte Firebase :
    ```bash
    firebase login
    ```
3.  Déployez les règles de sécurité Firestore définies à la racine du projet :
    ```bash
    firebase deploy --only firestore:rules --project VOTRE_PROJET_FIREBASE_ID
    ```

---

## 5. Démarrage de l'Application

Le projet supporte deux modes d'exécution standard : Développement (avec compilation dynamique des composants et rechargement à chaud) et Production (avec compilation optimisée et bundle serveur unifié).

### Option A : Lancer en Mode Développement (Recommandé en local)
Démarrez le serveur de développement local :
```bash
npm run dev
```
*   **Description** : Cette commande exécute `tsx server.ts` pour démarrer le serveur backend Express.
*   **Vite Dev Server** : Le serveur Express initialise l'instance de développement de Vite en mode Middleware. Les requêtes ciblant l'interface Web (SPA) sont ainsi interceptées et servies dynamiquement.
*   **Port d'écoute** : L'application est disponible à l'adresse suivante : [http://localhost:3000](http://localhost:3000).

### Option B : Compiler et Exécuter en Mode Production
Pour tester l'application dans des conditions réelles de performance, compilez les fichiers sources :
1.  **Générer les builds de production** :
    ```bash
    npm run build
    ```
    *Cette commande réalise un double build :*
    *   Compile et optimise l'interface SPA React via Vite dans le dossier statique `/dist`.
    *   Package et unifie le serveur Express (`server.ts`) dans un fichier autonome CJS optimisé localisé dans `/dist/server.cjs` à l'aide du compilateur hyper-rapide `esbuild`.
2.  **Démarrer le serveur de production** :
    ```bash
    npm run start
    ```
    L'application s'exécute à l'adresse : [http://localhost:3000](http://localhost:3000) de manière ultra-rapide en exploitant les bundles statiques compressés et le script serveur minifié.

---

## 6. Guide de Dépannage (Troubleshooting)

### Clé d'API Gemini manquante
*   **Symptôme** : Lors du clic sur "Lancer l'Analyse", l'erreur "Clé d'API Gemini manquante..." s'affiche.
*   **Solution** : Assurez-vous d'avoir créé un fichier `.env` à la racine (et non `.env.local` si vous utilisez notre configuration Express autonome, car le serveur Express charge `.env` via `dotenv.config()`). Relancez le terminal après modification.

### Échec d'autorisation Firebase Firestore
*   **Symptôme** : Message d'erreur Firestore se terminant par `PERMISSION_DENIED`.
*   **Solution** : 
    1. L'enregistrement asynchrone sur Cloud Firestore exige d'être **connecté** via son compte Google. Cliquez sur "Se connecter" dans la barre d'en-tête de l'application.
    2. Vos règles de sécurité Firestore exigent que votre adresse e-mail Google soit **vérifiée** pour pouvoir écrire en base. Assurez-vous que l'adresse e-mail de votre compte Google est validée.
