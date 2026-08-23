variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-south-1" # Mumbai — change to your preferred region
}

variable "project" {
  description = "Name prefix for all resources"
  type        = string
  default     = "school"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "eks_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.30"
}

variable "node_instance_type" {
  description = "EC2 instance type for worker nodes (t3.small keeps cost low)"
  type        = string
  default     = "t3.small"
}

variable "node_desired_size" {
  description = "How many worker nodes to run"
  type        = number
  default     = 2
}

# RDS costs money even when idle, so it is OFF by default.
# The app runs in in-memory mode without it — perfect for learning.
variable "create_rds" {
  description = "Set true to create a small Postgres RDS instance"
  type        = bool
  default     = false
}

variable "rds_password" {
  description = "Master password for RDS (only used when create_rds = true)"
  type        = string
  default     = ""
  sensitive   = true
}
