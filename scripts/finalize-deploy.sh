#!/bin/bash

# ==============================================================================
# Audiolab v3.0 - Script de Finalisation Post-Terraform
# ==============================================================================
# Ce script automatise les étapes de finalisation après l'exécution de Terraform :
# 1. Validation des dépendances et authentification (GCP & Firebase)
# 2. Extraction et écriture de la configuration Firebase cliente
# 3. Injection sécurisée de la clé d'API Gemini dans Secret Manager
# 4. Construction, tag et publication de l'image Docker de production
# 5. Déploiement de la vraie image sur Google Cloud Run
# 6. Déploiement des règles de sécurité Cloud Firestore
# ==============================================================================

set -euo pipefail

# Couleurs pour les messages de console
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0;6m' # No Color
BOLD='\033[1m'

echo -e "${BLUE}${BOLD}=== Audiolab v3.0 - Démarrage de la finalisation du déploiement ===${NC}\n"

# 1. Détecter le répertoire racine du projet
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TERRAFORM_DIR="$ROOT_DIR/terraform"

cd "$ROOT_DIR"

# Vérification que le répertoire terraform existe
if [ ! -d "$TERRAFORM_DIR" ]; then
  echo -e "${RED}[ERREUR] Le dossier 'terraform' est introuvable à la racine du projet.${NC}"
  exit 1
fi

# Vérification que Terraform a été appliqué
cd "$TERRAFORM_DIR"
if ! terraform state list >/dev/null 2>&1; then
  echo -e "${RED}[ERREUR] Aucun état Terraform valide trouvé. Veuillez exécuter 'terraform apply' dans le dossier terraform avant de lancer ce script.${NC}"
  exit 1
fi

echo -e "${GREEN}[OK] État Terraform détecté.${NC}"

# Récupération des outputs de Terraform
echo -e "${BLUE}Récupération des paramètres d'infrastructure depuis Terraform...${NC}"
PROJECT_ID=$(terraform output -json | jq -r '.firebase_web_config_json.value | fromjson | .projectId')
REGISTRY_REPO=$(terraform output -raw artifact_registry_repo)
CLOUD_RUN_URL=$(terraform output -raw cloud_run_url)
CLOUD_RUN_SERVICE_NAME="audiolab-service" # Nom configuré par défaut
REGISTRY_HOST=$(echo "$REGISTRY_REPO" | cut -d'/' -f1)

echo -e "  - Project ID: ${BOLD}$PROJECT_ID${NC}"
echo -e "  - Registry Repo: ${BOLD}$REGISTRY_REPO${NC}"
echo -e "  - Cloud Run Service URL: ${BOLD}$CLOUD_RUN_URL${NC}"

# 2. Génération de firebase-applet-config.json
echo -e "\n${BLUE}1/6. Extraction de la configuration client Firebase...${NC}"
CONFIG_FILE="$ROOT_DIR/firebase-applet-config.json"
terraform output -raw firebase_web_config_json > "$CONFIG_FILE"
echo -e "${GREEN}[OK] Fichier '$CONFIG_FILE' créé avec succès avec les clés publiques du projet.${NC}"

# 3. Vérification des connexions CLIs
echo -e "\n${BLUE}2/6. Vérification des authentifications CLI...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
  echo -e "${YELLOW}[WARNING] Vous n'êtes pas connecté à gcloud. Initialisation de la connexion...${NC}"
  gcloud auth login
fi
echo -e "${GREEN}[OK] CLI gcloud connectée.${NC}"

# 4. Injection de la clé API Gemini dans Secret Manager
echo -e "\n${BLUE}3/6. Vérification de la clé d'API Gemini dans Secret Manager...${NC}"
# Vérifier si une version du secret existe déjà
SECRET_EXISTS=false
if gcloud secrets versions list GEMINI_API_KEY --project="$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_EXISTS=true
fi

if [ "$SECRET_EXISTS" = true ]; then
  echo -e "${GREEN}[OK] Une clé d'API Gemini est déjà enregistrée dans Secret Manager.${NC}"
else
  echo -e "${YELLOW}Aucune clé d'API Gemini détectée dans Secret Manager.${NC}"
  # Demander à l'utilisateur sa clé API Gemini
  echo -n -e "${BOLD}Entrez votre clé d'API Google AI Studio (Gemini API Key) : ${NC}"
  read -s GEMINI_KEY
  echo ""
  if [ -z "$GEMINI_KEY" ]; then
    echo -e "${RED}[ERREUR] La clé d'API ne peut pas être vide. Fin de procédure.${NC}"
    exit 1
  fi
  echo -e "Enregistrement du secret dans Secret Manager..."
  echo -n "$GEMINI_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=- --project="$PROJECT_ID"
  echo -e "${GREEN}[OK] Clé Gemini stockée de manière sécurisée !${NC}"
fi

# 5. Compilation de la vraie image Docker de production
echo -e "\n${BLUE}4/6. Compilation de l'image Docker de production...${NC}"
cd "$ROOT_DIR"

IMAGE_TAG="${REGISTRY_REPO}/audiolab-app:v3.0"
GCP_REGION=$(echo "$REGISTRY_REPO" | cut -d'/' -f1 | cut -d'-' -f1-2) # Extrait la région du dépôt (ex: europe-west1)

echo -e "Choisissez le mode de compilation de votre conteneur Docker :"
echo -e "  1) ${BOLD}Google Cloud Build${NC} (Recommandé : compilé dans le Cloud, aucun outil local requis)"
echo -e "  2) ${BOLD}Docker Local${NC} (Requiert Docker Desktop installé et actif en local)"
echo -n -e "${BOLD}Votre choix (1 ou 2, par défaut 1) : ${NC}"
read -r BUILD_CHOICE

if [ "$BUILD_CHOICE" = "2" ]; then
  # Vérification du démon Docker
  if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}[ERREUR] Le démon Docker n'est pas démarré. Veuillez lancer Docker Desktop avant de continuer.${NC}"
    exit 1
  fi

  # Authentification Docker auprès d'Artifact Registry
  echo -e "Authentification Docker auprès d'Artifact Registry ($REGISTRY_HOST)..."
  gcloud auth configure-docker "$REGISTRY_HOST" --quiet

  # Build Docker
  echo -e "Construction locale de l'image Docker : ${BOLD}$IMAGE_TAG${NC}..."
  docker build -t "$IMAGE_TAG" .

  # Push Docker
  echo -e "Publication de l'image vers Artifact Registry..."
  docker push "$IMAGE_TAG"
else
  # Compilation via Google Cloud Build
  echo -e "Déclenchement de la compilation serverless via Google Cloud Build..."
  gcloud builds submit --tag "$IMAGE_TAG" --project="$PROJECT_ID"
fi
echo -e "${GREEN}[OK] Image Docker compilée et publiée avec succès !${NC}"

# 6. Déploiement de l'image sur Cloud Run
echo -e "\n${BLUE}5/6. Déploiement de la version de production sur Google Cloud Run...${NC}"
gcloud run deploy "$CLOUD_RUN_SERVICE_NAME" \
  --image="$IMAGE_TAG" \
  --region="$GCP_REGION" \
  --project="$PROJECT_ID"
echo -e "${GREEN}[OK] Application en cours d'exécution sur Cloud Run !${NC}"

# 7. Déploiement des règles de sécurité Firestore
echo -e "\n${BLUE}6/6. Déploiement des règles de sécurité Cloud Firestore...${NC}"
if ! command -v firebase &> /dev/null; then
  echo -e "${YELLOW}[WARNING] Firebase CLI non installée globalement. Tentative via npx...${NC}"
  npx --registry=https://registry.npmjs.org -y firebase-tools deploy --only firestore:rules --project="$PROJECT_ID"
else
  firebase deploy --only firestore:rules --project="$PROJECT_ID"
fi
echo -e "${GREEN}[OK] Règles Firestore activées.${NC}"

# Summary & Next Steps
echo -e "\n=============================================================================="
echo -e "${GREEN}${BOLD}✔ DEPLOYMENT FINALIZATION COMPLETED SUCCESSFULLY !${NC}"
echo -e "=============================================================================="
echo -e "Votre application est en ligne : ${BLUE}${BOLD}$CLOUD_RUN_URL${NC}"
echo -e "------------------------------------------------------------------------------"
echo -e "${YELLOW}${BOLD}⚠️ ACTION COMPLÉMENTAIRE OBLIGATOIRE :${NC}"
echo -e "Pour permettre l'authentification sécurisée (Google Sign-in) depuis le site web,"
echo -e "vous devez ajouter le domaine Cloud Run à la liste des domaines autorisés."
echo -e ""
echo -e "1. Rendez-vous sur : ${BOLD}https://console.firebase.google.com/u/0/project/${PROJECT_ID}/authentication/settings${NC}"
echo -e "2. Cliquez sur ${BOLD}'Authorized Domains' (Domaines Autorisés)${NC}."
echo -e "3. Cliquez sur ${BOLD}'Add Domain' (Ajouter un domaine)${NC}."
echo -e "4. Saisissez : ${BLUE}${BOLD}$(echo "$CLOUD_RUN_URL" | sed -e 's|^https://||' -e 's|/||g')${NC}"
echo -e "5. Cliquez sur ${BOLD}'Add' (Ajouter)${NC}."
echo -e "=============================================================================="
