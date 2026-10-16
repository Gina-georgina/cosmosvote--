terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # ---------------------------------------------------------------------------
  # Remote state backend (S3 + DynamoDB locking)
  #
  # One-time bootstrap (run once per AWS account before `terraform init`):
  #   1. Create the state bucket:
  #        aws s3api create-bucket \
  #          --bucket cosmosvote-tfstate \
  #          --region us-east-1 \
  #          --create-bucket-configuration LocationConstraint=us-east-1
  #        aws s3api put-bucket-versioning \
  #          --bucket cosmosvote-tfstate \
  #          --versioning-configuration Status=Enabled
  #        aws s3api put-bucket-encryption \
  #          --bucket cosmosvote-tfstate \
  #          --server-side-encryption-configuration \
  #            '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
  #        aws s3api put-public-access-block \
  #          --bucket cosmosvote-tfstate \
  #          --public-access-block-configuration \
  #            "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  #   2. Create the DynamoDB lock table:
  #        aws dynamodb create-table \
  #          --table-name cosmosvote-tfstate-lock \
  #          --attribute-definitions AttributeName=LockID,AttributeType=S \
  #          --key-schema AttributeName=LockID,KeyType=HASH \
  #          --billing-mode PAY_PER_REQUEST \
  #          --region us-east-1
  #   3. Then run: terraform init
  #
  # Backend config is split per environment in infra/terraform/envs/:
  #   terraform init -backend-config="envs/staging.s3.tfbackend"
  #   terraform init -backend-config="envs/production.s3.tfbackend"
  # ---------------------------------------------------------------------------
  backend "s3" {
    bucket         = "cosmosvote-tfstate"
    key            = "cosmosvote/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "cosmosvote-tfstate-lock"
  }
}

provider "aws" {
  region = var.aws_region
}

# CloudFront requires ACM certs in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

locals {
  bucket_name = "cosmosvote-frontend-${var.environment}"
  origin_id   = "cosmosvote-s3-${var.environment}"
}

# ─── S3 bucket ────────────────────────────────────────────────────────────────
resource "aws_s3_bucket" "frontend" {
  bucket        = local.bucket_name
  force_destroy = var.environment != "production"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration { status = "Enabled" }
}

# ─── CloudFront OAC ───────────────────────────────────────────────────────────
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = local.origin_id
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFront"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    }]
  })
}

# ─── CloudFront distribution ──────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  comment             = "CosmosVote frontend (${var.environment})"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = local.origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  # SPA fallback: return index.html for 403/404
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
  }
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
