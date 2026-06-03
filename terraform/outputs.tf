output "cloud_run_url" {
  value       = google_cloud_run_v2_service.app_service.uri
  description = "L'URL publique du service NodeJS/Express déployé sur Google Cloud Run."
}

output "artifact_registry_repo" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}"
  description = "Le chemin de destination de votre dépôt Docker Artifact Registry pour pousser vos builds."
}

output "firebase_web_config_json" {
  value = jsonencode({
    projectId         = var.project_id
    appId             = google_firebase_web_app.web_app.app_id
    apiKey            = data.google_firebase_web_app_config.web_app_config.api_key
    authDomain        = data.google_firebase_web_app_config.web_app_config.auth_domain
    storageBucket     = data.google_firebase_web_app_config.web_app_config.storage_bucket
    messagingSenderId = data.google_firebase_web_app_config.web_app_config.messaging_sender_id
    measurementId     = data.google_firebase_web_app_config.web_app_config.measurement_id
  })
  sensitive   = true
  description = "Le contenu JSON complet à copier directement dans votre fichier firebase-applet-config.json."
}

output "firebase_web_config_instruction" {
  value       = "Exécutez 'terraform output -raw firebase_web_config_json' pour extraire directement la configuration pour firebase-applet-config.json"
  description = "Commande d'assistance pour récupérer facilement la configuration de la Web App Firebase."
}
