variable "project_id" {
  type        = string
  description = "L'ID unique de votre projet Google Cloud Platform (GCP)."
}

variable "region" {
  type        = string
  default     = "europe-west1"
  description = "La région GCP par défaut pour héberger le dépôt, Firestore et Cloud Run (ex : europe-west1, europe-west9)."
}

variable "service_name" {
  type        = string
  default     = "audiolab-service"
  description = "Le nom du service Google Cloud Run à déployer."
}

variable "repository_id" {
  type        = string
  default     = "audiolab-repo"
  description = "Le nom du dépôt d'images Docker dans Artifact Registry."
}

variable "secret_id" {
  type        = string
  default     = "GEMINI_API_KEY"
  description = "L'identifiant du secret stocké dans Google Secret Manager."
}
