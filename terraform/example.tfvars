# Copy to terraform.tfvars (git-ignored) and adjust, then:
#   terraform apply -var-file=terraform.tfvars
aws_region         = "ap-south-1"
project            = "school"
node_instance_type = "t3.small"
node_desired_size  = 2

# Enable the database only when you want to practice RDS:
# create_rds   = true
# rds_password = "ChangeMe-Strong-Password-1"
