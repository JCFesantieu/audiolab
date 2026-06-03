# 1. Activation des APIs Google Cloud requises
locals {
  gcp_services = [
    "run.googleapis.com",              # Cloud Run
    "secretmanager.googleapis.com",    # Secret Manager
    "artifactregistry.googleapis.com", # Artifact Registry
    "firestore.googleapis.com",        # Cloud Firestore
    "firebase.googleapis.com",         # Firebase Services
    "identitytoolkit.googleapis.com",  # Identity Platform (Firebase Auth)
    "cloudbuild.googleapis.com"        # Google Cloud Build (Serverless builds)
  ]
}

resource "google_project_service" "services" {
  for_each           = toset(local.gcp_services)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# 2. Création du dépôt d'images Docker sur Artifact Registry
resource "google_artifact_registry_repository" "repo" {
  project       = var.project_id
  location      = var.region
  repository_id = var.repository_id
  description   = "Dépôt d'images Docker pour Audiolab"
  format        = "DOCKER"

  depends_on = [google_project_service.services["artifactregistry.googleapis.com"]]
}

# 3. Création du secret dans Google Secret Manager
resource "google_secret_manager_secret" "gemini_key" {
  project   = var.project_id
  secret_id = var.secret_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services["secretmanager.googleapis.com"]]
}

# Version initiale placeholder du secret pour éviter l'erreur Cloud Run (Secret Latest not found)
resource "google_secret_manager_secret_version" "gemini_key_placeholder" {
  secret      = google_secret_manager_secret.gemini_key.id
  secret_data = "placeholder-change-me"

  lifecycle {
    ignore_changes = [
      secret_data
    ]
  }
}


# 4. Récupération des infos projet GCP (requis pour le numéro de projet IAM)
data "google_project" "project" {
  project_id = var.project_id
}

# Autoriser le compte de service par défaut à accéder à la clé Gemini dans Secret Manager
resource "google_secret_manager_secret_iam_member" "secret_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.gemini_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

# 5. Enregistrement du projet GCP auprès de Firebase (Requis pour Auth & Web App)
resource "google_firebase_project" "firebase" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.services["firebase.googleapis.com"]]
}

# 6. Enregistrement de l'application Web Client Firebase
resource "google_firebase_web_app" "web_app" {
  provider     = google-beta
  project      = var.project_id
  display_name = "Audiolab Web Client"

  depends_on = [google_firebase_project.firebase]
}

# 7. Récupération des clés de configuration publiques générées par Firebase
data "google_firebase_web_app_config" "web_app_config" {
  provider   = google-beta
  project    = var.project_id
  web_app_id = google_firebase_web_app.web_app.app_id
}

# 8. Déploiement du Service Applicatif Google Cloud Run
resource "google_cloud_run_v2_service" "app_service" {
  name     = var.service_name
  location = var.region
  project  = var.project_id

  template {
    containers {
      # Utilise une image temporaire "hello" lors du premier déploiement pour éviter l'échec
      # de création si l'image Docker personnalisée n'a pas encore été compilée/poussée.
      image = "gcr.io/cloudrun/hello"

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          memory = "1Gi"
          cpu    = "1"
        }
      }

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.audiolab_archives.name
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  # Permet aux déploiements d'images Docker externes (CI/CD ou script de push) de mettre à jour
  # l'image de production sans que Terraform n'écrase la révision de l'image active.
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image
    ]
  }

  depends_on = [
    google_project_service.services["run.googleapis.com"],
    google_secret_manager_secret.gemini_key,
    google_secret_manager_secret_version.gemini_key_placeholder,
    google_secret_manager_secret_iam_member.secret_accessor,
    google_storage_bucket.audiolab_archives
  ]
}

# 9. IAM : Rendre le service Cloud Run publiquement accessible par allUsers
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app_service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# 10. Google Cloud Storage Bucket pour archiver les fichiers audio de manière isolée et sécurisée
resource "google_storage_bucket" "audiolab_archives" {
  name          = "audiolab-archives-${var.project_id}"
  location      = var.region
  project       = var.project_id
  force_destroy = false

  uniform_bucket_level_access = true

  cors {
    origin          = ["*"]
    method          = ["GET", "PUT", "POST", "HEAD", "OPTIONS"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.services["firestore.googleapis.com"]] # ensure base services are enabled
}

# Accorder des permissions Object Admin au compte de service par défaut de Cloud Run
resource "google_storage_bucket_iam_member" "storage_admin" {
  bucket = google_storage_bucket.audiolab_archives.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}




