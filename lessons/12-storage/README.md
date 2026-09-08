# 📚 Lesson 12 — Storage & state: backpack vs library shelf

**📍 You are here:** Lesson **12** of 13 · Previous: `lesson-11-rollouts` · Next: `lesson-13-under-the-hood`

---

## 📦 What's in this branch

Lessons 01–11, **plus**: **storage** — what survives a pod's death and what
doesn't, and the honest answer to "where should my database live?" Real files:

- [k8s/secret.example.yaml](../../k8s/secret.example.yaml) — `DATABASE_URL` pointing *outside* the cluster
- [terraform/rds.tf](../../terraform/rds.tf) — the managed Postgres this repo actually uses
- [docker-compose.yml](../../docker-compose.yml) — see the `volumes:` line keeping local Postgres data

## 🧒 Explain like I'm 5

When a kid leaves school for good, two kinds of stuff exist:

- **Their backpack** 🎒 — goes home WITH them. Gone. That's a pod's own
  filesystem: every file a container writes disappears when the pod dies.
  (And pods die all the time — lessons 03, 09, 11 kill them on purpose!)
- **The library shelf** 📚 — books stay in the library, no matter which kids
  come and go. The next kid picks up exactly where the last one left off.
  That's a **PersistentVolume**: storage with a life of its own.

How does a pod get shelf space? It files a request slip: *"I need 10Gi of
shelf, please"* — that's a **PersistentVolumeClaim (PVC)**. The librarian
(a StorageClass + CSI driver — on AWS, an EBS disk) finds or creates a real
shelf and clips it to the pod. New pod later? Same slip → **same shelf, same
books**.

And the biggest kid secret 🤫: sometimes the best library is **across the
street**. This repo keeps its database in **RDS** — AWS's professionally-run
library — instead of running Postgres inside the cluster. Both are valid;
knowing *when* to choose which is the real lesson.

## 🗺️ Diagram

```mermaid
flowchart TB
    subgraph cluster["🏫 Kubernetes cluster"]
        pod1["🪑 postgres pod v1<br/>💥 dies"]
        pod2["🪑 postgres pod v2<br/>new desk, same books"]
        pvc["📝 PVC: 'I claim 10Gi'"]
        pod1 -.-> pvc
        pod2 --> pvc
    end
    pv["📚 PersistentVolume<br/>= real EBS disk on AWS<br/>outlives every pod"]
    pvc --> pv
    subgraph outside["🏛️ across the street - what THIS repo does"]
        rds["AWS RDS Postgres<br/>backups, patching, failover<br/>managed by AWS"]
    end
    api["🪑 school-api pods"] -->|"DATABASE_URL from the Secret<br/>lesson 06"| rds
```

## ❓ What

- **Volume** — storage attached to a pod. `emptyDir` lives only as long as the
  pod (backpack); a PVC-backed volume survives it (shelf).
- **PersistentVolume (PV)** — the actual storage (an EBS disk on EKS).
  **PersistentVolumeClaim (PVC)** — a pod's request slip for one.
  **StorageClass** — the librarian that creates PVs on demand.
- **StatefulSet** — a special Deployment for stateful apps (databases): pods
  get stable names (`postgres-0`) and each keeps its own PVC.
- **The architectural choice**: stateful-in-cluster (StatefulSet + PVC) vs
  **managed service outside** (RDS). This repo chose RDS — see
  [terraform/rds.tf](../../terraform/rds.tf).

## 🤔 Why

Everything in lessons 01–11 worked *because* pods were disposable — kill them,
move them, multiply them. Databases break that spell: data must NOT be
disposable. PV/PVC restores the spell by splitting the lifecycle: pods stay
cattle, storage becomes the pet. But running a production database well
(backups, upgrades, failover, tuning) is a full-time job — which is why small
teams usually **rent the librarian** (RDS) and keep the cluster stateless.
Rule of thumb: stateless in the cluster, state in managed services — exactly
this repo's shape.

## 🔧 How (in this repo)

- The app pods are **stateless on purpose** — no volumes in
  [k8s/deployment.yaml](../../k8s/deployment.yaml) at all. All state lives in
  Postgres, reached via `DATABASE_URL` from lesson 06's Secret:
  `postgres://school:...@your-rds-endpoint:5432/school`.
- [terraform/rds.tf](../../terraform/rds.tf) builds that Postgres with
  automated backups and encryption — things a StatefulSet would make *you* do.
- Locally, [docker-compose.yml](../../docker-compose.yml) shows the same idea
  in miniature: a named Docker volume keeps Postgres data across restarts.

## 🧪 Try it

```bash
# Feel the difference between backpack and shelf (local cluster):
kubectl -n school apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: shelf }
spec:
  accessModes: [ReadWriteOnce]
  resources: { requests: { storage: 1Gi } }
EOF
kubectl -n school run scribe --restart=Never --image=busybox \
  --overrides='{"spec":{"containers":[{"name":"scribe","image":"busybox",
    "command":["sh","-c","echo my homework > /shelf/notes.txt; sleep 3600"],
    "volumeMounts":[{"name":"s","mountPath":"/shelf"}]}],
    "volumes":[{"name":"s","persistentVolumeClaim":{"claimName":"shelf"}}]}}'

kubectl -n school delete pod scribe          # kid leaves school 💥
# New kid, same claim — the homework is still there:
kubectl -n school run scribe2 --restart=Never --image=busybox \
  --overrides='{"spec":{"containers":[{"name":"scribe2","image":"busybox",
    "command":["sh","-c","cat /shelf/notes.txt; sleep 60"],
    "volumeMounts":[{"name":"s","mountPath":"/shelf"}]}],
    "volumes":[{"name":"s","persistentVolumeClaim":{"claimName":"shelf"}}]}}'
kubectl -n school logs scribe2               # → "my homework" 🎉
kubectl -n school delete pod scribe2 && kubectl -n school delete pvc shelf
```

## ⏭️ Next

Final lesson: open the school office door and meet the machinery that made ALL
of this happen — the **control plane**.

```bash
git checkout lesson-13-under-the-hood
```
