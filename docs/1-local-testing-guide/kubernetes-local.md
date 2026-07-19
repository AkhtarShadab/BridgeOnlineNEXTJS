# Local Kubernetes on Docker Desktop (LoadBalancer)

Run BridgeOnline on Docker Desktop's built-in Kubernetes, exposed through a
`type: LoadBalancer` Service. Docker Desktop assigns the LoadBalancer
`EXTERNAL-IP = localhost` and binds the port on your host — so the app lands at
**http://localhost:3000** with no port-forward and no MetalLB.

## 0. One-time: enable Kubernetes

Docker Desktop → **Settings → Kubernetes → Enable Kubernetes → Apply & restart**.
Then confirm your CLI points at it:

```bash
kubectl config use-context docker-desktop
kubectl get nodes            # one node "docker-desktop", STATUS Ready
```

## 1. Build the image

Docker Desktop's Kubernetes shares the Docker daemon, so a locally-built image is
usable directly — **no registry push** (the manifests set `imagePullPolicy: IfNotPresent`).

```bash
# from the repo root. NEXT_PUBLIC_SOCKET_URL is baked in, so it must match the LB origin.
docker build -t bridgeonline:local --build-arg NEXT_PUBLIC_SOCKET_URL=http://localhost:3000 .
```

## 2. Deploy the stack

```bash
kubectl apply -f deploy/k8s/local/stack.yaml
kubectl get pods -w          # wait until bridge / postgres / redis are Running & READY 1/1
```

The `bridge` pod runs an **initContainer** (`db-push`) that applies the Prisma
schema once Postgres is up, then starts the all-in-one server (Next.js + Socket.io
+ BullMQ worker), with `REDIS_URL` wired so the Redis features are active.

## 3. Open it

```bash
kubectl get svc bridge       # EXTERNAL-IP shows "localhost", PORT 3000:3xxxx
```

Browse **http://localhost:3000**, register a user, create a room. Health/metrics:

```bash
curl -s localhost:3000/api/health   | jq   # {status:ok, db:up, redis:up}
curl -s localhost:3000/api/metrics  | head
```

---

## 4. Viewing logs

### A. `kubectl` (recommended — most reliable)

```bash
# The app (follow, live)
kubectl logs -f deploy/bridge

# The init/schema-push step (if the pod is stuck on startup)
kubectl logs deploy/bridge -c db-push

# Datastores
kubectl logs -f deploy/postgres
kubectl logs -f deploy/redis

# A crashed/restarted container's PREVIOUS logs
kubectl logs deploy/bridge --previous

# Everything with the app label, prefixed by pod (handy once you scale/split)
kubectl logs -f -l app=bridge --all-containers --prefix
```

The app emits **Pino JSON** in production mode — pretty-print on demand:

```bash
kubectl logs -f deploy/bridge | npx pino-pretty
```

Bump verbosity by editing `LOG_LEVEL` in the ConfigMap (`debug`/`trace`) and
re-applying, then `kubectl rollout restart deploy/bridge`.

### B. Docker Desktop GUI

Kubernetes pods run as containers on the shared daemon, so they show up in Docker
Desktop's **Containers** tab (names like `k8s_bridge_bridge-…_default_…`):

1. Open **Containers** → find the `bridge`, `postgres`, `redis` entries (group is
   the pod). Click one.
2. **Logs** tab — live tail with a search/filter box.
3. **Stats** tab — live CPU / memory / network for that container.
4. **Exec** tab — a shell inside the container (e.g. `redis-cli` in the redis one).

> Newer Docker Desktop also has a left-nav **Kubernetes** view listing workloads;
> the Containers tab above works on every version.

### C. `docker` CLI (same daemon)

```bash
docker ps                                   # k8s pod containers are listed here
docker logs -f <bridge-container-id>
docker stats                                # live resource usage, all containers
```

### D. `stern` (optional, nicest multi-pod tailing)

```bash
stern bridge                                # colorized tail across all matching pods
```

---

## 5. Iterate / tear down

```bash
# After a code change: rebuild the image, then restart the rollout
docker build -t bridgeonline:local --build-arg NEXT_PUBLIC_SOCKET_URL=http://localhost:3000 .
kubectl rollout restart deploy/bridge

# Remove everything
kubectl delete -f deploy/k8s/local/stack.yaml
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `bridge` pod stuck `Init:0/1` | Postgres not ready yet — watch `kubectl logs deploy/bridge -c db-push`; it retries automatically. |
| `ErrImageNeverPull` / `ImagePullBackOff` | Image not built into the local daemon. Run the `docker build` in step 1; manifests use `imagePullPolicy: IfNotPresent`. |
| `EXTERNAL-IP` stuck `<pending>` | Kubernetes not fully up, or another process holds `:3000`. `kubectl get nodes`; free the port or change the Service `port`. |
| Readiness never passes | `curl` fails → `kubectl logs deploy/bridge`; if `/api/health` returns 503, check `db`/`redis` pods are `Running`. |
| Sockets don't connect in the browser | `NEXT_PUBLIC_SOCKET_URL` was baked with a different origin — rebuild with the right `--build-arg` and `rollout restart`. |

> **Scaling note:** keep `bridge` at `replicas: 1`. This all-in-one image holds
> Socket.io rooms in-process; running more than one replica requires the split
> web/socket/worker topology with sticky sessions + the Redis adapter — see
> [service separation](../2-deployment-guide/service-separation.md).
