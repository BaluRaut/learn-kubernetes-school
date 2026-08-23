# ECR = AWS's private Docker registry. CircleCI pushes images here;
# EKS worker nodes pull them from here.
#
# One repository per service. `for_each` creates both from one block —
# a small taste of Terraform loops.
locals {
  ecr_repos = {
    api       = "${var.project}-api"       # Node.js school-api
    analytics = "${var.project}-analytics" # Python school-analytics
  }
}

resource "aws_ecr_repository" "service" {
  for_each = local.ecr_repos
  name     = each.value

  image_scanning_configuration {
    scan_on_push = true # free vulnerability scan on every push
  }

  # Allows `terraform destroy` even if images exist — good for a learning repo.
  force_delete = true
}

# Keep only the last 10 images so the registries don't grow forever.
resource "aws_ecr_lifecycle_policy" "service" {
  for_each   = aws_ecr_repository.service
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
