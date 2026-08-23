# Pin Terraform and provider versions so `terraform init` is reproducible.
#
# State: by default Terraform writes terraform.tfstate to this folder (fine
# for learning). In a team you would use a remote backend (S3 + DynamoDB lock)
# — see the commented block below.
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # backend "s3" {
  #   bucket         = "your-tf-state-bucket"
  #   key            = "school-platform/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "school-platform"
      ManagedBy = "terraform"
      Purpose   = "learning"
    }
  }
}
