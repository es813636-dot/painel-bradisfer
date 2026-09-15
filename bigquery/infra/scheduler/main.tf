terraform {

  required_version = ">= 1.5"
  required_providers {
    google = {
      source = "hashicorp/google", version = "~> 6.0"
    }

  }


}

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "bq_location" {
  type = string
}

variable "image" {
  type = string
}

variable "writer_email" {
  type = string
}

variable "refresh_enabled" {
  type    = bool
  default = false
}

variable "pbi_client_id" {
  type    = string
  default = ""
}

variable "pbi_tenant_id" {
  type    = string
  default = ""
}

provider "google" {
  project = var.project_id
}

resource "google_project_service" "apis" {

  for_each           = toset(["run.googleapis.com", "cloudscheduler.googleapis.com", "secretmanager.googleapis.com", "storage.googleapis.com"])
  service            = each.key
  disable_on_destroy = false

}

resource "google_storage_bucket" "control" {

  name                        = "${var.project_id}-etl-control"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  lifecycle {
    prevent_destroy = true
  }


}

resource "google_storage_bucket_iam_member" "control" {

  bucket = google_storage_bucket.control.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.writer_email}"

}

resource "google_secret_manager_secret" "credentials" {

  for_each  = toset(["sysemp-token", "powerbi-refresh-token"])
  secret_id = each.key
  replication {
    auto {

    }

  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.apis]

}

resource "google_secret_manager_secret_iam_member" "read" {

  for_each  = google_secret_manager_secret.credentials
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.writer_email}"

}

resource "google_secret_manager_secret_iam_member" "rotate" {

  secret_id = google_secret_manager_secret.credentials["powerbi-refresh-token"].id
  role      = "roles/secretmanager.secretVersionAdder"
  member    = "serviceAccount:${var.writer_email}"

}

resource "google_service_account" "scheduler" {

  account_id   = "bradisfer-etl-scheduler"
  display_name = "Executa carga Bradisfer"

}

locals {

  config = {

    BQ_PROJECT_ID        = var.project_id
    BQ_LOCATION          = var.bq_location
    BQ_RAW_DATASET       = "bradisfer_raw"
    BQ_COMERCIAL_DATASET = "bradisfer_comercial"
    BQ_STAGING_DATASET   = "bradisfer_staging"
    BQ_CONTROL_BUCKET    = google_storage_bucket.control.name
    PBI_REFRESH_ENABLED  = tostring(var.refresh_enabled)
    PBI_DATASET_ID       = "709ebd76-0982-4a78-bd8c-8fc429df14aa"
    PBI_CLIENT_ID        = var.pbi_client_id
    PBI_TENANT_ID        = var.pbi_tenant_id
    PBI_MAX_DAILY        = "8"
    PBI_INTERVAL_MINUTES = "120"
    PBI_TOKEN_SECRET     = google_secret_manager_secret.credentials["powerbi-refresh-token"].id

  }


}

resource "google_cloud_run_v2_job" "etl" {

  name                = "bradisfer-vendas"
  location            = var.region
  deletion_protection = true
  template {

    task_count  = 1
    parallelism = 1
    template {

      service_account = var.writer_email
      max_retries     = 0
      timeout         = "5400s"
      containers {

        image = var.image
        resources {
          limits = {
            cpu = "1", memory = "512Mi"
          }

        }

        dynamic "env" {

          for_each = local.config
          content {
            name  = env.key
            value = env.value
          }


        }

        env {

          name = "SYSEMP_TOKEN"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.credentials["sysemp-token"].secret_id
              version = "latest"
            }

          }


        }

        dynamic "env" {

          for_each = var.refresh_enabled ? [1] : []
          content {

            name = "PBI_REFRESH_TOKEN"
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.credentials["powerbi-refresh-token"].secret_id
                version = "latest"
              }

            }


          }


        }


      }


    }


  }

  depends_on = [google_project_service.apis, google_secret_manager_secret_iam_member.read, google_storage_bucket_iam_member.control]

}

resource "google_cloud_run_v2_job_iam_member" "invoke" {

  name     = google_cloud_run_v2_job.etl.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"

}

resource "google_cloud_scheduler_job" "incremental" {

  name             = "bradisfer-vendas-5min"
  region           = var.region
  schedule         = "*/5 5-23 * * *"
  time_zone        = "America/Sao_Paulo"
  paused           = true
  attempt_deadline = "30s"
  http_target {

    uri         = "https://run.googleapis.com/v2/${google_cloud_run_v2_job.etl.id}:run"
    http_method = "POST"
    body        = base64encode("{}")
    headers = {
      "Content-Type" = "application/json"
    }

    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }


  }

  depends_on = [google_cloud_run_v2_job_iam_member.invoke]

}

resource "google_cloud_scheduler_job" "reconcile" {

  name             = "bradisfer-vendas-reconciliar"
  region           = var.region
  schedule         = "30 4 * * *"
  time_zone        = "America/Sao_Paulo"
  paused           = true
  attempt_deadline = "30s"
  http_target {

    uri         = "https://run.googleapis.com/v2/${google_cloud_run_v2_job.etl.id}:run"
    http_method = "POST"
    body = base64encode(jsonencode({
      overrides = {
        containerOverrides = [{
          env = [{
            name = "BQ_RECONCILE_DAYS", value = "7"
            }
          ]
          }
        ]
      }

      }
    ))
    headers = {
      "Content-Type" = "application/json"
    }

    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }


  }

  depends_on = [google_cloud_run_v2_job_iam_member.invoke]

}

# Reconciliation overrides require this specific extra permission on the same job.
resource "google_cloud_run_v2_job_iam_member" "override" {

  name     = google_cloud_run_v2_job.etl.name
  location = var.region
  role     = "roles/run.jobsExecutorWithOverrides"
  member   = "serviceAccount:${google_service_account.scheduler.email}"

}


