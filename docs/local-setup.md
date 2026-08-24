# 💻 Local Setup — Run Everything on Your Machine (No AWS, No Cost)

This guide takes you from a fresh machine to the **whole platform running locally**, in three
levels. Each level builds on the previous one, and each ends with a ✅ check so you know it
worked before moving on. Nothing here touches AWS or costs money.

| Level | What runs | What you learn |
|---|---|---|
| [Level 1](#level-1--plain-processes-5-min) | Node + Python APIs as plain processes | the apps themselves |
| [Level 2](#level-2--docker-compose-10-min) | Both APIs + Postgres in containers | Docker & compose |
| [Level 3](#level-3--local-kubernetes-20-min) | Everything inside a local Kubernetes cluster | the real k8s workflow |

---

## Prerequisites

**Required for all levels:**

| Tool | Check | Install (macOS) |
|---|---|---|
| Git | `git --version` | `xcode-select --install` |
| Node.js ≥ 20 | `node --version` | `brew install node` (or [nvm](https://github.com/nvm-sh/nvm)) |
| Python ≥ 3.9 | `python3 --version` | preinstalled on macOS |

**Required from Level 2 onward:**

| Tool | Check | Install (macOS) |
|---|---|---|
| Docker Desktop | `docker ps` | `brew install --cask docker`, then **launch the app** |

**Required for Level 3:**

| Tool | Check | Install (macOS) |
|---|---|---|
| kubectl | `kubectl version --client` | `brew install kubectl` |
| a local cluster | `kubectl get nodes` | Docker Desktop → Settings → Kubernetes → **Enable** (easiest), or `brew install minikube && minikube start` |

Clone the repo first:

```bash
git clone https://github.com/BaluRaut/claod-2026-eks-docker-terraform.git
cd claod-2026-eks-docker-terraform
```

### Ports used locally

| Port | Used by | Level |
|---|---|---|
| 3000 | school-api (Node) | 1, 2 |
| 8000 | school-analytics (Python) | 1, 2 |
| 5432 | Postgres | 2 |
| 8080 / 8081 | kubectl port-forward | 3 |

If a port is busy: `lsof -i :3000` shows what's squatting on it.

---

## Level 1 — Plain processes (5 min)

No Docker, no database — the Node API falls back to an **in-memory** store, and the Python
API talks to the Node API. This proves the apps work before any DevOps enters the picture.

**Terminal 1 — the Node API:**

```bash
cd apps/school-api
npm install
npm start                    # -> school-api listening on port 3000 (db: in-memory)
```

**Terminal 2 — the Python API:**

```bash
cd apps/school-analytics
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000     # SCHOOL_API_URL defaults to http://localhost:3000
```

**✅ Check:**

```bash
curl localhost:3000/students             # 2 seeded students
curl localhost:8000/analytics/summary    # {"students":2,"teachers":1,...}
open http://localhost:8000/docs          # FastAPI's interactive API explorer
```

**Run the tests** (same commands CircleCI runs):

```bash
cd apps/school-api && npm test
cd apps/school-analytics && source .venv/bin/activate && pip install pytest && pytest test/
```

Stop everything with `Ctrl+C` in each terminal.

---

## Level 2 — Docker Compose (10 min)

Now the same two apps run as **containers**, plus a real Postgres — three containers, one
private network, one command. Make sure Docker Desktop is running first (`docker ps` works).

```bash
docker compose up --build
```

What happens (watch the logs):
1. Both images are built from their Dockerfiles (first time: a few minutes; later: cached).
2. Postgres starts; the `api` container **waits** until its healthcheck passes (`depends_on`).
3. The Node API connects to Postgres (`db: postgres` instead of in-memory!).

**✅ Check** (new terminal):

```bash
docker ps                                # 3 containers running
curl localhost:3000/                     # note: "db":"postgres" now
curl localhost:8000/analytics/summary    # Python -> Node, container-to-container
```

**Prove the data survives** (this is the volume from diagram 2, step 7):

```bash
curl -X POST localhost:3000/students -H 'content-type: application/json' \
     -d '{"name":"Test Kid","grade":"1A"}'
docker compose restart api db
curl localhost:3000/students             # Test Kid is still there ✅
```

**Stop:**

```bash
docker compose down        # stop containers (data volume kept)
docker compose down -v     # ...and also wipe the database volume
```

---

## Level 3 — Local Kubernetes (20 min)

The full k8s experience — same manifests as production, just local images instead of ECR.
First enable Kubernetes: **Docker Desktop → Settings → Kubernetes → Enable** (or `minikube start`),
then confirm `kubectl get nodes` shows a node.

> **minikube users:** run `eval $(minikube docker-env)` first so the images you build land
> inside minikube's Docker, otherwise the pods can't find them.

**1. Build the images:**

```bash
docker build -t school-api:local apps/school-api
docker build -t school-analytics:local apps/school-analytics
```

**2. Deploy** (swapping the ECR placeholders for the local images):

```bash
kubectl apply -f k8s/namespace.yaml -f k8s/configmap.yaml
sed 's|IMAGE_PLACEHOLDER|school-api:local|' k8s/deployment.yaml | kubectl apply -f -
sed 's|ANALYTICS_IMAGE_PLACEHOLDER|school-analytics:local|' k8s/analytics-deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/service.yaml -f k8s/analytics-service.yaml
```

**3. Watch it come up** (this is diagram 08 happening live):

```bash
kubectl -n school get pods -w      # Pending -> ContainerCreating -> Running (Ctrl+C to stop)
```

**✅ Check:**

```bash
kubectl -n school get pods                    # 4 pods, all READY 1/1
kubectl -n school port-forward svc/school-api 8080:80 &
kubectl -n school port-forward svc/school-analytics 8081:80 &
curl localhost:8080/students
curl localhost:8081/analytics/summary         # Python found Node via cluster DNS!
```

**4. The magic trick — self-healing:**

```bash
kubectl -n school delete pod -l app=school-api    # kill both API pods on purpose
kubectl -n school get pods                        # ...already being replaced
```

**Notes for local mode:**
- The Node API runs **in-memory** here (no Postgres in the cluster, no `k8s/secret.yaml`) — that's fine for learning the k8s mechanics.
- `ingress.yaml` and `hpa.yaml` are skipped locally: the ALB ingress is AWS-only, and the HPA needs metrics-server. Port-forward plays the ingress's role.

**Clean up:**

```bash
kill %1 %2 2>/dev/null                 # stop the port-forwards
kubectl delete namespace school        # removes everything in one go
```

---

## Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| `Cannot connect to the Docker daemon` | Docker Desktop isn't running → launch it, wait for the whale icon |
| `port is already allocated` / `EADDRINUSE` | something else on the port → `lsof -i :3000`, kill it or change the port |
| Pod stuck `ImagePullBackOff` (local k8s) | cluster can't see your local image → rebuild with the exact tag `school-api:local`; on minikube run `eval $(minikube docker-env)` **before** building |
| Pod `0/1 READY` forever | readiness probe failing → `kubectl -n school describe pod <name>` and check the Events at the bottom |
| `analytics` says `school-api unreachable` | Node API not up yet (Level 1: start it first) or wrong `SCHOOL_API_URL` |
| compose `api` restarts repeatedly | Postgres not healthy yet → wait; check `docker compose logs db` |
| `kubectl` talks to the wrong cluster | `kubectl config current-context` → switch with `kubectl config use-context docker-desktop` |
| Apple Silicon: image built on Mac fails on EKS later | build for the right platform in CI (CircleCI does this correctly; locally add `--platform linux/amd64` only when pushing to ECR by hand) |

## Where next?

Levels 1–3 cost nothing and cover ~70% of the learning. When you're ready for real AWS:
continue with the [Terraform section](../README.md#4️⃣-terraform--infrastructure-as-code-on-aws)
of the main README — and remember `terraform destroy` at the end of the day.
