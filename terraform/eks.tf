# EKS = managed Kubernetes on AWS. AWS runs the control plane (API server,
# etcd, scheduler); we only manage worker nodes — here via a managed node group.
#
# COST WARNING: an EKS control plane costs ~$0.10/hour (~$73/month) even when
# idle, plus the EC2 nodes and NAT gateway. For learning: create it, play,
# then `terraform destroy` the same day.
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "${var.project}-eks"
  cluster_version = var.eks_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets # nodes live in PRIVATE subnets

  # Public endpoint so you (and CircleCI) can run kubectl from outside the VPC.
  # A hardened production setup would restrict this to known CIDRs.
  cluster_endpoint_public_access = true

  # Give the identity running `terraform apply` cluster-admin access.
  enable_cluster_creator_admin_permissions = true

  eks_managed_node_groups = {
    default = {
      instance_types = [var.node_instance_type]
      min_size       = 1
      desired_size   = var.node_desired_size
      max_size       = 3
    }
  }
}
