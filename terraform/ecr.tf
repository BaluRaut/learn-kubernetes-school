# ECR = AWS's private Docker registry. CircleCI pushes images here;
# EKS worker nodes pull them from here.
resource "aws_ecr_repository" "school_api" {
  name = "${var.project}-api"

  image_scanning_configuration {
    scan_on_push = true # free vulnerability scan on every push
  }

  # Allows `terraform destroy` even if images exist — good for a learning repo.
  force_delete = true
}

# Keep only the last 10 images so the registry doesn't grow forever.
resource "aws_ecr_lifecycle_policy" "school_api" {
  repository = aws_ecr_repository.school_api.name

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
