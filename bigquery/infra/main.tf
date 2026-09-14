terraform {
  required_version = ">= 1.5"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}

variable "project_id" { type = string }
variable "location" { type = string }
variable "raw_dataset" { type = string }
variable "comercial_dataset" { type = string }
variable "staging_dataset" { type = string }
variable "github_repository_id" { type = string }
variable "github_owner_id" { type = string }
variable "github_repository" {
  type    = string
  default = "es813636-dot/painel-bradisfer"
}
variable "github_ref" {
  type    = string
  default = "refs/heads/main"
}

provider "google" { project = var.project_id }
data "google_project" "current" { project_id = var.project_id }

check "separate_datasets" {
  assert {
    condition     = length(toset([var.raw_dataset, var.comercial_dataset, var.staging_dataset])) == 3
    error_message = "Raw, comercial e staging devem ser datasets diferentes."
  }
}

resource "google_project_service" "apis" {
  for_each           = toset(["bigquery.googleapis.com", "iam.googleapis.com", "iamcredentials.googleapis.com", "sts.googleapis.com", "sheets.googleapis.com"])
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

resource "google_bigquery_dataset" "data" {
  for_each                    = toset([var.raw_dataset, var.comercial_dataset, var.staging_dataset])
  dataset_id                  = each.key
  location                    = var.location
  delete_contents_on_destroy  = false
  default_table_expiration_ms = each.key == var.staging_dataset ? 86400000 : null
  lifecycle { prevent_destroy = true }
  depends_on = [google_project_service.apis]
}

resource "google_service_account" "writer" {
  account_id   = "bradisfer-github-bq"
  display_name = "GitHub carga paralela BigQuery"
}
resource "google_service_account" "reader" {
  account_id   = "bradisfer-powerbi-ro"
  display_name = "Power BI leitura comercial"
}

# Runtime cannot create/drop curated tables or administer datasets/IAM.
# A separate operator applies Terraform and schema.js DDL once.
resource "google_project_iam_custom_role" "writer" {
  role_id     = "bradisferDataLoader"
  title       = "Bradisfer data loader"
  permissions = ["bigquery.tables.get", "bigquery.tables.getData", "bigquery.tables.updateData", "bigquery.tables.list"]
}
resource "google_bigquery_dataset_iam_member" "writer" {
  for_each   = toset([var.raw_dataset, var.comercial_dataset])
  dataset_id = google_bigquery_dataset.data[each.key].dataset_id
  role       = google_project_iam_custom_role.writer.name
  member     = "serviceAccount:${google_service_account.writer.email}"
}
resource "google_bigquery_dataset_iam_member" "staging" {
  dataset_id = google_bigquery_dataset.data[var.staging_dataset].dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${google_service_account.writer.email}"
}
resource "google_bigquery_dataset_iam_member" "reader" {
  dataset_id = google_bigquery_dataset.data[var.comercial_dataset].dataset_id
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${google_service_account.reader.email}"
}
resource "google_project_iam_member" "jobs" {
  for_each = { writer = google_service_account.writer.email, reader = google_service_account.reader.email }
  project  = var.project_id
  role     = "roles/bigquery.jobUser"
  member   = "serviceAccount:${each.value}"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "bradisfer-github"
  depends_on                = [google_project_service.apis]
}
resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
  }
  # GitHub repositories created after 2026-07-15 use immutable IDs in sub.
  attribute_condition = "assertion.repository_owner_id == '${var.github_owner_id}' && assertion.repository_id == '${var.github_repository_id}' && assertion.ref == '${var.github_ref}' && assertion.workflow_ref == '${var.github_repository}/.github/workflows/bigquery-paralelo.yml@${var.github_ref}' && assertion.sub == 'repo:${split("/", var.github_repository)[0]}@${var.github_owner_id}/${split("/", var.github_repository)[1]}@${var.github_repository_id}:environment:bigquery-paralelo'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}
resource "google_service_account_iam_member" "oidc" {
  service_account_id = google_service_account.writer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}

output "workload_identity_provider" { value = google_iam_workload_identity_pool_provider.github.name }
output "github_service_account" { value = google_service_account.writer.email }
output "powerbi_service_account" { value = google_service_account.reader.email }
