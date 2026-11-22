environment              = "staging"
aws_region               = "us-east-1"
cdn_price_class          = "PriceClass_100"
immutable_assets_max_age = 3600

github_owner                   = "cosmosvote"
github_repository              = "cosmosvote"
github_branch                  = "main"
github_required_status_checks  = ["ci/build", "ci/test", "ci/lint"]
github_enforce_admins          = false
github_require_pr_reviews      = true
github_required_approving_review_count = 1
github_dismiss_stale_reviews   = true
github_require_conversation_resolution = true
github_require_linear_history  = false
github_allow_force_pushes      = false
github_allow_deletions         = false