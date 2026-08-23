# Outputs = values printed after `terraform apply` (and readable any time
# with `terraform output`). You will need these for CircleCI and kubectl.

output "ecr_repository_url" {
  description = "Push Docker images here (CircleCI env var AWS_ECR_REGISTRY_ID uses the account part)"
  value       = aws_ecr_repository.school_api.repository_url
}

output "eks_cluster_name" {
  description = "Used by: aws eks update-kubeconfig --name <this>"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "Kubernetes API server URL"
  value       = module.eks.cluster_endpoint
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "rds_endpoint" {
  description = "Postgres hostname (only when create_rds = true)"
  value       = var.create_rds ? aws_db_instance.school[0].address : "not created"
}
