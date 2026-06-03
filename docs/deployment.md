# Guide de Déploiement Unifié (GCP & Firebase) - Audiolab v3.0

Ce document décrit la procédure pas-à-pas pour configurer, héberger et déployer l'application **Audiolab v3.0** de bout en bout. 

Pour assurer une cohérence parfaite de l'infrastructure et une gestion saine des dépendances, **le projet Google Cloud Platform (GCP) est créé en premier**, puis **Firebase est greffé directement dessus**. Cela permet de partager nativement le même identifiant de projet, la même facturation, et de minimiser les coûts de transfert de données inter-services.

---

## 1. Architecture Globale de Production

L'architecture de production couple la flexibilité de la brique client de Firebase (Auth + Firestore) à la puissance brute et sécurisée du serveur applicatif Express hébergé sur GCP.

```mermaid
graph TD
    User["Client / Navigateur (React 19)"] -->|1. Authentification Google| FirebaseAuth["Firebase Authentication"]
    User -->|2. Archivage & Temps Réel| Firestore["Cloud Firestore"]
    User -->|3. POST /api/analyze (WAV Base64)| CloudRun["Google Cloud Run (Express)"]
    CloudRun -->|4. Lecture Clé IA| SecretManager["Secret Manager : GEMINI_API_KEY"]
    CloudRun -->|5. Téléversement & Analyse| Gemini["Google Gemini API"]
    Gemini -->|6. JSON Structuré| CloudRun
    CloudRun -->|7. Réponse 200 OK| User
```

### 🌟 Avantages Clés de cette Intégration Unifiée
*   **Identifiant Unique** : Le client web et le serveur Express partagent le même ID de projet Google, ce qui simplifie l'administration IAM et la facturation.
*   **Zéro Latence** : En hébergeant Firestore et Cloud Run dans la même région physique Google Cloud, les temps de transit réseau sont quasi-nuls.
*   **Coûts Maîtrisés (Scale to Zero)** : Les instances Cloud Run s'éteignent automatiquement en l'absence d'analyses en cours, limitant les coûts applicatifs au strict minimum.

---

## 2. Étape 1 : Création et Initialisation du Projet Google Cloud (GCP)

Avant d'activer Firebase ou de déployer le serveur, vous devez initialiser le conteneur de ressources principal sur GCP.

### 2.1. Initialisation de la CLI gcloud
Installez d'abord le [SDK Google Cloud (gcloud CLI)](https://cloud.google.com/sdk/docs/install) sur votre machine locale, puis configurez votre session de travail :

```bash
# 1. Authentification sécurisée à votre compte Google Cloud
gcloud auth login

# 2. Configuration des variables locales (À adapter avec vos identifiants)
export GCP_PROJECT_ID="VOTRE_PROJET_GCP_ID"
export GCP_REGION="europe-west1"

# 3. Liaison de la CLI à votre projet actif
gcloud config set project $GCP_PROJECT_ID
```

> [!IMPORTANT]
> Assurez-vous d'activer la facturation (Billing account) sur ce projet GCP dans votre console Google Cloud. Cloud Run et Firestore en ont besoin pour fonctionner correctement en production.

---

## 3. Étape 2 : Liaison et Configuration de Firebase

Puisque Firebase est une surcouche applicative développée par Google, vous devez greffer Firebase sur le projet GCP existant.

### 3.1. Liaison du projet sur la Console Firebase
1.  Rendez-vous sur la [Console Firebase](https://console.firebase.google.com/).
2.  Cliquez sur **Ajouter un projet**.
3.  **Très important** : Ne tapez pas un nouveau nom de projet ! Cliquez sur le menu déroulant et **sélectionnez votre projet GCP existant** (créé à l'Étape 1 via son ID).
4.  Firebase va configurer automatiquement les API communes et lier la facturation. Cliquez sur **Continuer**.

### 3.2. Configuration de Firebase Authentication (Google Sign-In)
Pour permettre à vos utilisateurs de s'identifier et de sécuriser leurs rapports :
1.  Dans la console Firebase, allez dans **Build > Authentication** (menu latéral gauche).
2.  Cliquez sur **Commencer** (*Get Started*).
3.  Dans l'onglet **Méthode de connexion**, sélectionnez **Google**.
4.  Activez le fournisseur, renseignez le nom de l'application et votre e-mail de support, puis cliquez sur **Enregistrer**.

### 3.3. Provisionnement de la Base de Données Cloud Firestore
1.  Allez dans **Build > Cloud Firestore** et cliquez sur **Créer une base de données**.
2.  **Identifiant de la base** : Conservez la valeur par défaut `(default)`.
3.  **Emplacement** : Choisissez **impérativement la même région** que votre projet GCP (ex : `europe-west1` si défini à l'Étape 1) pour éviter les frais de sortie de données (*Egress costs*).
4.  **Règles de sécurité** : Choisissez **Commencer en mode production** (nous les écraserons à l'étape suivante).
5.  Cliquez sur **Créer**.

---

## 4. Étape 3 : Configuration Cliente et Fichier Local

Pour que votre interface web (React SPA) sache à quel projet Firebase se connecter :

1.  Dans la console Firebase, cliquez sur l'icône d'engrenage en haut à gauche (Paramètres du projet) puis allez sur l'onglet **Général**.
2.  Sous la section **Vos applications**, cliquez sur le bouton **Web** (`</>`).
3.  Enregistrez l'application (ex : `Audiolab Web`) et copiez l'objet JSON de configuration généré.
4.  Créez ou modifiez le fichier `firebase-applet-config.json` à la racine de votre projet local :

```json
{
  "projectId": "VOTRE_PROJECT_ID",
  "appId": "VOTRE_APP_ID",
  "apiKey": "VOTRE_API_KEY",
  "authDomain": "VOTRE_PROJECT_ID.firebaseapp.com",
  "storageBucket": "VOTRE_PROJECT_ID.firebasestorage.app",
  "messagingSenderId": "VOTRE_SENDER_ID",
  "measurementId": ""
}
```

---

## 5. Étape 4 : Déploiement des Règles de Sécurité Firestore

Pour sécuriser Firestore et bloquer toute tentative d'abus ou de modification frauduleuse de rapports, déployez les règles de sécurité locales ([firestore.rules](file:///Users/jcfesantieu/devlocal/Remix/firestore.rules)) :

1.  **Installer les outils Firebase CLI** :
    ```bash
    npm install -g firebase-tools
    ```
2.  **S'authentifier auprès de Firebase** :
    ```bash
    firebase login
    ```
3.  **Associer le dossier local au projet Firebase** :
    ```bash
    firebase use --add
    # Sélectionnez votre projet lié dans la liste et nommez son alias (ex : 'prod')
    ```
4.  **Déployer les règles Firestore** :
    ```bash
    firebase deploy --only firestore:rules
    ```

> [!TIP]
> Le déploiement de ces règles met immédiatement en vigueur la sécurité des données : validation stricte de l'identité (`ownerId == request.auth.uid`), limitation du tableau de tours à 100 éléments max et immuabilité du rapport post-génération.

---

## 6. Étape 5 : Configuration de Google Secret Manager

La clé d'API Google AI Studio permettant de requêter les modèles Gemini doit être isolée de manière sécurisée sur GCP :

1.  **Activer l'API Secret Manager** :
    ```bash
    gcloud services enable secretmanager.googleapis.com
    ```
2.  **Créer le conteneur du secret** :
    ```bash
    gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
    ```
3.  **Ajouter votre clé d'API Gemini** comme valeur active :
    ```bash
    echo -n "VOTRE_CLE_API_GEMINI" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
    ```

---

## 7. Étape 6 : Publication de l'Image Docker (Artifact Registry)

Nous compilons notre serveur NodeJS/Express sous forme de conteneur Docker et l'hébergeons sur le registre privé sécurisé de GCP.

1.  **Activer l'API Artifact Registry** :
    ```bash
    gcloud services enable artifactregistry.googleapis.com
    ```
2.  **Créer le dépôt d'images Docker** dans la région définie :
    ```bash
    gcloud artifacts repositories create audiolab-repo \
        --repository-format=docker \
        --location=$GCP_REGION \
        --description="Dépôt d'images Docker pour Audiolab"
    ```
3.  **Configurer Docker pour s'authentifier auprès de GCP** :
    ```bash
    gcloud auth configure-docker ${GCP_REGION}-docker.pkg.dev
    ```
4.  **Construire l'image Docker en local** (via le `Dockerfile` multi-stage) :
    ```bash
    docker build -t ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/audiolab-repo/audiolab-app:v3.0 .
    ```
5.  **Pousser l'image sur le registre GCP** :
    ```bash
    docker push ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/audiolab-repo/audiolab-app:v3.0
    ```

---

## 8. Étape 7 : Déploiement Applicatif sur Google Cloud Run

Déployez le service Express sur Cloud Run et injectez de façon transparente le secret créé à l'Étape 5.

```bash
gcloud run deploy audiolab-service \
    --image=${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/audiolab-repo/audiolab-app:v3.0 \
    --region=$GCP_REGION \
    --platform=managed \
    --allow-unauthenticated \
    --port=3000 \
    --memory=1Gi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=5 \
    --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

### 🔍 Points Clés du Paramétrage :
*   `--allow-unauthenticated` : Rend l'interface web publique (l'accès aux données Firestore reste protégé par Firebase Auth).
*   `--memory=1Gi` : Alloue **1 Go de RAM** pour supporter le décodage et la manipulation en mémoire tampon des fichiers WAV volumineux.
*   `--min-instances=0` : Éteint l'instance si aucune requête n'est reçue (Scale to Zero pour zéro coût d'inactivité).
*   `--set-secrets="..."` : Extrait de manière transparente le secret `GEMINI_API_KEY` depuis Secret Manager et l'injecte dans la variable d'environnement `process.env.GEMINI_API_KEY` du conteneur NodeJS.

---

## 9. Étape 8 : Autorisation du Domaine Cloud Run sur Firebase Auth

> [!WARNING]
> **Action critique de fin de déploiement !** Firebase Authentication bloque par défaut les fenêtres de connexion Google issues de domaines inconnus. 

Dès que le déploiement Cloud Run se termine, copiez l'URL de service publique générée par Google (ex : `https://audiolab-service-xxxx.a.run.app`).

1.  Dans la console Firebase, allez dans **Build > Authentication > Paramètres** (*Settings*).
2.  Cliquez sur **Domaines autorisés** dans le menu latéral de gauche.
3.  Cliquez sur **Ajouter un domaine**.
4.  Collez l'URL de votre service Cloud Run **en supprimant** le préfixe `https://` et les slashs (ex : `audiolab-service-xxxx.a.run.app`).
5.  Cliquez sur **Ajouter**.

---

## 10. Optimisations Avancées en Production

### 10.1. Éviter les Latences d'Initialisation (Cold Start)
Pour supprimer le délai d'attente lié au premier démarrage d'instance après une extinction prolongée :
```bash
gcloud run services update audiolab-service --min-instances=1 --region=$GCP_REGION
```
*Note : Conserver au moins 1 instance allumée en permanence entraîne une facturation minimale fixe.*

### 10.2. Supporter des Fichiers WAV Très Volumineux
Le proxy standard de Google Cloud Run limite la taille du payload HTTP à **32 Mo**. Pour outrepasser cette restriction :
1.  **Compression Audio** : Réduisez le taux d'échantillonnage ou utilisez un encodage WAV mono optimisé côté client avant envoi.
2.  **Activer HTTP/2** : Cloud Run supporte le streaming bidirectionnel HTTP/2, ce qui permet de gérer des fichiers lourds de manière fluide :
    ```bash
    gcloud run services update audiolab-service --use-http2 --region=$GCP_REGION
    ```

---

## 11. Déploiement Alternatif & Automatisé via Terraform

Pour automatiser l'ensemble du provisionnement des ressources décrites dans ce guide (APIs GCP, Artifact Registry, Secret Manager, Firestore default, projet Firebase et Web App), vous pouvez utiliser les scripts d'Infrastructure-as-Code (IaC) disponibles dans le dossier [terraform/](file:///Users/jcfesantieu/devlocal/Remix/terraform/).

### 11.1. Initialisation et Variables
1.  Rendez-vous dans le dossier Terraform :
    ```bash
    cd terraform
    ```
2.  Créez votre fichier de variables à partir de l'exemple :
    ```bash
    cp terraform.tfvars.example terraform.tfvars
    ```
3.  Éditez `terraform.tfvars` et saisissez votre `project_id` Google Cloud cible (obtenu à l'étape 1).

### 11.2. Exécution de Terraform
1.  Initialisez les providers Terraform :
    ```bash
    terraform init
    ```
2.  Visualisez le plan de création des ressources :
    ```bash
    terraform plan
    ```
3.  Appliquez le déploiement :
    ```bash
    terraform apply
    ```

> [!NOTE]
> Lors du premier `apply`, le service Cloud Run est déployé avec une image placeholder (`gcr.io/cloudrun/hello`) pour éviter l'échec si l'image Docker de production n'a pas encore été générée. Le bloc `lifecycle` de Terraform est configuré pour ignorer les modifications futures de l'image Docker faites en externe.

### 11.3. Finalisation Automatisée via Script
Pour éviter toutes les étapes manuelles de finalisation (injection de clé secrète, construction et push de l'image Docker, déploiement réel de l'image de production sur Cloud Run, écriture du fichier de configuration client Firebase et poussée des règles de sécurité Firestore), un script d'automatisation tout-en-un est fourni.

1.  Depuis la racine du projet, assurez-vous que votre Docker Desktop est actif et lancez le script :
    ```bash
    ./scripts/finalize-deploy.sh
    ```
2.  Le script récupère dynamiquement les outputs de Terraform, génère le fichier `firebase-applet-config.json`, vous demande (si nécessaire) votre clé d'API Gemini de manière masquée pour Secret Manager, compile et publie votre conteneur de production, effectue la mise à jour sur Cloud Run et pousse vos règles de base de données !
3.  Il affiche ensuite le lien vers l'interface de la console Firebase pour effectuer la dernière étape manuelle obligatoire : ajouter l'URL de votre service Cloud Run aux **Domaines autorisés** de Firebase Authentication (comme décrit à l'Étape 8).


