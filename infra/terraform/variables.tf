variable "aws_region" {
  description = "AWS region for S3 bucket"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment: staging or production"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "faucet_api_origin" {
  description = "HTTPS origin of the faucet API allowed by the frontend CSP"
  type        = string
  validation {
    condition     = can(regex("^https://[^/]+$", var.faucet_api_origin))
    error_message = "faucet_api_origin must be an HTTPS origin without a path."
  }
}

variable "cdn_price_class" {
  description = <<-EOT
    CloudFront price class controlling which edge locations serve the distribution.
    PriceClass_All     — all edge locations globally (lowest latency worldwide, higher cost).
    PriceClass_200     — North America, Europe, Asia, Middle East, Africa.
    PriceClass_100     — North America and Europe only (cheapest, higher latency elsewhere).
    Production should use PriceClass_All; staging can use PriceClass_100 to reduce cost.
  EOT
  type        = string
  default     = "PriceClass_All"
  validation {
    condition     = contains(["PriceClass_All", "PriceClass_200", "PriceClass_100"], var.cdn_price_class)
    error_message = "cdn_price_class must be PriceClass_All, PriceClass_200, or PriceClass_100."
  }
}

variable "immutable_assets_max_age" {
  description = <<-EOT
    max-age value (in seconds) for the Cache-Control header on immutable static assets
    (JS, CSS, fonts, images under /assets/*).
    Default: 31536000 (1 year). These files are content-addressed by Vite (filename
    includes a hash), so they can be cached indefinitely.
  EOT
  type        = number
  default     = 31536000
}

variable "github_owner" {
  description = "GitHub user or organization that owns the repository"
  type        = string
}

variable "github_repository" {
  description = "Name of the GitHub repository to manage branch protection for"
  type        = string
}

variable "github_token" {
  description = <<-EOT
    GitHub token used by the Terraform GitHub provider. Must have admin access to the
    repository to manage branch protection. Supply via TF_VAR_github_token or a
    secret-backed CI variable; never commit it to version control.
  EOT
  type        = string
  sensitive   = true
}

variable "branch_protection_branch" {
  description = "Branch to protect (e.g. main)"
  type        = string
  default     = "main"
}

variable "required_approving_review_count" {
  description = "Number of approving reviews required before a PR can be merged"
  type        = number
  default     = 1
  validation {
    condition     = var.required_approving_review_count >= 0
    error_message = "required_approving_review_count must be zero or greater."
  }
}

variable "required_status_checks" {
  description = "List of status check contexts that must pass before merging"
  type        = list(string)
  default     = []
}

variable "enforce_admins" {
  description = "Whether branch protection rules also apply to repository administrators"
  type        = bool
  default     = true
}
