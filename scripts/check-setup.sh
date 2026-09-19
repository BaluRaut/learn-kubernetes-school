#!/usr/bin/env bash
# 🎒 One-command "what you need on your machine" check for Learn Kubernetes School.
ok(){ printf "  ✅ %s\n" "$1"; }; miss(){ printf "  ❌ %s — %s\n" "$1" "$2"; }
echo "🔎 checking the tools the labs use…"
command -v git >/dev/null      && ok "git $(git --version | awk '{print $3}')"                 || miss "git" "install from git-scm.com"
command -v docker >/dev/null   && ok "docker $(docker --version | awk '{print $3}' | tr -d ,)"  || miss "docker" "Docker Desktop (or podman) — needed to build the lunchboxes"
command -v kubectl >/dev/null  && ok "kubectl $(kubectl version --client 2>/dev/null | grep -o 'v[0-9.]*' | head -1)" || miss "kubectl" "kubernetes.io/docs/tasks/tools"
if command -v minikube >/dev/null || command -v kind >/dev/null || command -v k3d >/dev/null; then ok "a local cluster tool (minikube / kind / k3d)"; else miss "minikube|kind|k3d" "pick one — every lesson 1–13 runs locally, free"; fi
kubectl cluster-info >/dev/null 2>&1 && ok "a cluster answers: $(kubectl config current-context)" || echo "  ℹ️  no cluster running yet — 'minikube start' when you reach lesson 02"
command -v terraform >/dev/null && ok "terraform (optional — only the EKS capstone)" || echo "  ℹ️  terraform not installed — fine until the optional AWS capstone"
command -v aws >/dev/null && ok "aws cli (optional — EKS capstone only)"   || echo "  ℹ️  aws cli not installed — fine until the optional AWS capstone"
echo "📚 cluster options: minikube / kind / k3d = free, on your laptop, lessons 1–26 · EKS = 'running it for real', ~\$0.10/h control plane + nodes — capstone only, destroy same day."
