# VPC = your private slice of the AWS network.
# The official terraform-aws-modules/vpc module builds ~20 resources for us:
# subnets, route tables, internet gateway, NAT gateway, etc.
#
# Layout (see docs/images/04-terraform-aws.svg):
#   - public subnets  -> things that face the internet (load balancers, NAT)
#   - private subnets -> things that must NOT be reachable directly (EKS nodes, RDS)
data "aws_availability_zones" "available" {
  state = "available"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project}-vpc"
  cidr = var.vpc_cidr

  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.101.0/24", "10.0.102.0/24"]

  # NAT gateway lets private subnets reach the internet (pull images, updates)
  # without being reachable FROM the internet. single_nat_gateway = one NAT
  # instead of one per AZ — less resilient, much cheaper. Fine for learning.
  enable_nat_gateway = true
  single_nat_gateway = true

  enable_dns_hostnames = true

  # These tags tell EKS / the AWS Load Balancer Controller which subnets
  # to place load balancers in.
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}
