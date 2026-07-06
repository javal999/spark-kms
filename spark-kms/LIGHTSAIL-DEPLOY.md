# SPARK KMS on AWS Lightsail (live)

The app runs on **Amazon Lightsail** — a container service (managed HTTPS, load
balancing, scaling) plus a Lightsail-managed PostgreSQL database. Chosen over
App Runner (which is winding down — no new customers/features) and ECS Express
(≈2× the cost). ~**$30/month**, predictable.

## What's running (region ap-southeast-1)
| Piece | Resource | Notes |
|---|---|---|
| App | Lightsail container service `spark-kms`, power `small` (0.5 vCPU / 1 GB), scale 1 | Managed HTTPS URL, auto load-balanced |
| Database | Lightsail PostgreSQL `spark-kms-db`, `postgres_16`, bundle `micro` | `pg_trgm` enabled; 7-day automated backups |
| Image | Pushed to the service's private registry (`:spark-kms.app.N`) | amd64, from the repo `Dockerfile` |

**Live URL:** `https://spark-kms.7020sm9rkgn2y.ap-southeast-1.cs.amazonlightsail.com`

Runtime env (set on the deployment, encrypted at rest by Lightsail):
`DATABASE_URL` (uses the DB's **hostname** — resolves to the private Lightsail IP
from the container), `SESSION_SECRET`, `NODE_ENV=production`. Container listens on
`8080`; `CMD` forces `HOSTNAME=0.0.0.0`.

## Prereqs on the operator's Mac
AWS CLI (configured), Colima + Docker + buildx, `lightsailctl` (`brew install
aws/tap/lightsailctl`). `lightsailctl` needs the Colima socket:
`export DOCKER_HOST=$(docker context inspect colima --format '{{.Endpoints.docker.Host}}')`.

## Redeploy a new version of the app
```bash
export DOCKER_HOST=$(docker context inspect colima --format '{{.Endpoints.docker.Host}}')
cd spark-kms
# Build amd64 and load into local docker (Rosetta handles esbuild on Apple Silicon):
docker buildx build --platform linux/amd64 --load -t spark-kms:latest .
# Push to Lightsail's registry (returns a new :spark-kms.app.N reference):
aws lightsail push-container-image --service-name spark-kms --label app --image spark-kms:latest --region ap-southeast-1
# Then create a new deployment referencing that image tag (see deployment JSON in the runbook),
# or edit it in the Lightsail console → Deployments → the image dropdown → Save.
```
A deployment is `containers.app.image = :spark-kms.app.N`, `environment` (the 3
vars above), `ports {"8080":"HTTP"}`, and `publicEndpoint` with healthCheck path
`/api/health`, successCodes `200-399`.

## Run a database migration (on schema changes)
The DB isn't publicly reachable. To connect from a laptop for `db:migrate` /
`db:provision`, temporarily open it, then close it:
```bash
aws lightsail update-relational-database --relational-database-name spark-kms-db --publicly-accessible --region ap-southeast-1
# The endpoint hostname may cache to a private IP on your ISP — resolve the PUBLIC IP:
nslookup <db-endpoint> 8.8.8.8      # use the returned public IP in the URL below
export DATABASE_URL="postgresql://sparkadmin:<pw>@<public-ip>:5432/spark_kms?sslmode=require"
npm run db:migrate
# ... provision more admins if needed ...
aws lightsail update-relational-database --relational-database-name spark-kms-db --no-publicly-accessible --region ap-southeast-1
```

## Operations
- **HTTPS**: automatic on the Lightsail URL. Custom domain: Lightsail console →
  the container service → Custom domains → add + create the DNS record.
- **Backups**: Lightsail DB automated backups (enable/adjust in console). Manual
  snapshot: `aws lightsail create-relational-database-snapshot`.
- **Logs**: `aws lightsail get-container-log --service-name spark-kms --container-name app`.
- **Rotate SESSION_SECRET**: change it in the deployment env → redeploy (logs
  everyone out). Rotate the **viewer password in-app** (Admin → Viewer password).
- **Scale**: raise `--scale` or move to `medium` power (1 vCPU / 2 GB) if 1 GB
  gets tight under load.
- **Cost**: container `small` $15/mo + DB `micro` $15/mo ≈ **$30/mo** flat.
