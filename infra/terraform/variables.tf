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
