# Optional PostgreSQL database (RDS). OFF by default — enable with:
#   terraform apply -var="create_rds=true" -var="rds_password=YourStrongPassword1"
#
# `count` is Terraform's on/off switch: count = 0 means "do not create".

# Security group: only things INSIDE the VPC (i.e. the EKS nodes) may reach
# Postgres on port 5432. The database is never exposed to the internet.
resource "aws_security_group" "rds" {
  count       = var.create_rds ? 1 : 0
  name        = "${var.project}-rds"
  description = "Allow Postgres from inside the VPC"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "Postgres from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_subnet_group" "school" {
  count      = var.create_rds ? 1 : 0
  name       = "${var.project}-db"
  subnet_ids = module.vpc.private_subnets # DB lives in PRIVATE subnets
}

resource "aws_db_instance" "school" {
  count = var.create_rds ? 1 : 0

  identifier     = "${var.project}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t4g.micro" # smallest/cheapest class
  db_name        = "school"
  username       = "school"
  password       = var.rds_password

  allocated_storage      = 20
  db_subnet_group_name   = aws_db_subnet_group.school[0].name
  vpc_security_group_ids = [aws_security_group.rds[0].id]

  skip_final_snapshot = true # learning setup: destroy cleanly without snapshots
}
