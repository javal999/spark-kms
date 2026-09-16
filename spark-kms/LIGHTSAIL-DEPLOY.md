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

**Live URL:** `https://kms.paracorplabs.com`
(default Lightsail URL still works: `https://spark-kms.7020sm9rkgn2y.ap-southeast-1.cs.amazonlightsail.com`)

**Custom domain**: a Lightsail cert `spark-kms-cert` for `kms.paracorplabs.com`,
DNS-validated + a CNAME to the service in the `paracorplabs.com` Route 53 zone
(`Z08021231UBQAD3NUQW2H`). HTTPS on the custom domain is managed by Lightsail.

Runtime env (set on the deployment, encrypted at rest by Lightsail):
`DATABASE_URL` (uses the DB's **hostname** — resolves to the private Lightsail IP
from the container), `SESSION_SECRET`, `NODE_ENV=production`. Container listens on
`8080`; `CMD` forces `HOSTNAME=0.0.0.0`.

## Prereqs on the operator's Mac
AWS CLI with an MFA session: `Enforce-MFA-Policy` denies every Lightsail call, reads included, to the plain access key. Start one per terminal tab (lasts 12 h):
`eval "$(aws sts get-session-token --serial-number arn:aws:iam::756286194006:mfa/levi-phone-google --token-code <code> --duration-seconds 43200 --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text | awk '{print "export AWS_ACCESS_KEY_ID="$1" AWS_SECRET_ACCESS_KEY="$2" AWS_SESSION_TOKEN="$3}')"`
Colima + Docker + buildx, `lightsailctl` (`brew install aws/tap/lightsailctl`); it needs `export DOCKER_HOST=$(docker context inspect colima --format '{{.Endpoints.docker.Host}}')`.
**Every `create-container-service-deployment` and `get-container-service*` call gets a `--query`.** Their replies carry all 14 environment values — `create-container-service-deployment` prints them twice, once per `currentDeployment` and `nextDeployment`; a bare call leaked them on 2026-09-11 and forced a full rotation.

## Redeploy a new version of the app
**The `--build-arg` flags are not optional.** `NEXT_PUBLIC_*` are inlined into
the client bundle at build time and default to `0` in the `Dockerfile`. Build
without them and the image ships with SSO, the graph and usage tracking dark, no
matter what the runtime deployment env says — the runtime value only covers the
server-side reads. This is exactly how deployment 29 shipped a login page with no
"Sign in with Microsoft" button on 2026-08-24. Keep these three in step with the
runtime `environment` block below.

**Deploy only what is committed, pushed and green.** The image is built on this
Mac from the working tree — it never passes through CI, which runs only the
nightly retention schedule. So nothing else stops an untested or uncommitted
build from reaching production: the regression guards in
`tests/unit/sso-redirects.test.ts` (E17, FV-1, FV-5) protect production only if
they run here. The `&&` below is the gate — if any of the four fail, the image is
never built. `git status` must be clean and not ahead of `origin`, so the
deployed image is a commit you can find and roll back to.

```bash
export DOCKER_HOST=$(docker context inspect colima --format '{{.Endpoints.docker.Host}}')
cd spark-kms
# Refuse unless committed, pushed and green; then build amd64 and load into local
# docker (Rosetta handles esbuild on Apple Silicon). No comments inside the chain:
# interactive zsh runs `#` as a command unless `interactivecomments` is set.
test -z "$(git status --porcelain)" && [ "$(git rev-list --count origin/main..HEAD)" = 0 ] \
  || { echo "Commit and push first — deploy only what is in git." >&2; false; } && \
npm run gates && \
docker buildx build --platform linux/amd64 --load \
  --build-arg NEXT_PUBLIC_FEATURE_GRAPH=1 \
  --build-arg NEXT_PUBLIC_FEATURE_TRACKING=1 \
  --build-arg NEXT_PUBLIC_FEATURE_SSO=1 \
  -t spark-kms:latest .
# Push to Lightsail's registry (returns a new :spark-kms.app.N reference):
aws lightsail push-container-image --service-name spark-kms --label app --image spark-kms:latest --region ap-southeast-1
# Then create a new deployment referencing that image tag (see deployment JSON in the runbook),
# or edit it in the Lightsail console → Deployments → the image dropdown → Save.
```

**Build the deployment JSON from the live one, not from this page.** The running
deployment carries **14** environment variables, not the 3 named above: the four
`AZURE_*` for SSO, `CRON_SECRET` for the retention job, the three
`NEXT_PUBLIC_FEATURE_*`, both `OPENROUTER_*`, `APP_ORIGIN`
(`https://kms.paracorplabs.com`, where page redirects point — FV-5), plus
`DATABASE_URL`, `SESSION_SECRET` and `NODE_ENV`. Hand-writing the environment
block from this runbook silently drops the other eleven. Copy the live one and
change only the image — passed in as `IMAGE`, not hand-edited into the file:

```bash
IMAGE=":spark-kms.app.N"   # exactly what push-container-image printed
aws lightsail get-container-service-deployments --service-name spark-kms \
  --region ap-southeast-1 --query 'deployments[0]' --output json > current.json
aws lightsail create-container-service-deployment --service-name spark-kms \
  --region ap-southeast-1 \
  --query 'containerService.nextDeployment.{version:version,state:state}' \
  --cli-input-json "$(jq --arg img "$IMAGE" '{serviceName:"spark-kms", containers:{app:{image:$img, environment:.containers.app.environment, ports:.containers.app.ports}}, publicEndpoint:{containerName:.publicEndpoint.containerName, containerPort:.publicEndpoint.containerPort, healthCheck:.publicEndpoint.healthCheck}}' current.json)" \
  && rm current.json
```
`current.json` holds every secret in plain text. It is removed on success; if the
create fails, delete it yourself once you are done retrying.

A deployment is `containers.app.image = :spark-kms.app.N`, `environment` (all 14
vars), `ports {"8080":"HTTP"}`, and `publicEndpoint` with healthCheck path
`/api/health`, successCodes `200-399`.

### After every deploy, check page redirects point at the public host
A gated page must redirect to the absolute public URL. A relative `/login?next=…`
means `APP_ORIGIN` is missing or invalid on the deployment, and page redirects
have silently fallen back to depending on Next internals (FV-5):
```bash
curl -s -o /dev/null -D - https://kms.paracorplabs.com/initiatives | grep -i '^location'
# expect: location: https://kms.paracorplabs.com/login?next=%2Finitiatives
curl -s -o /dev/null -D - https://kms.paracorplabs.com/api/auth/logout | grep -i '^location'
# expect: location: /login   (API routes stay relative by design — E17)
```

### After every deploy, check the flags actually survived
`curl` cannot answer this. `/login` is a client component behind `<Suspense>`, so
the sign-in buttons are not in the server-rendered HTML — grepping the response
returns 0 whether SSO is on or off. Open the page in a browser and look for the
**"Sign in with Microsoft"** button. If it is missing and only the viewer password
form shows, the build args were missed: rebuild with them and redeploy, because
the runtime env cannot fix an already-baked bundle.

Cheaper and better: preflight the image locally before pushing it, which catches
this without touching production at all.
```bash
curl -s https://kms.paracorplabs.com/api/health          # {"ok":true} — liveness only

docker run -d --name spark-preflight -p 8081:8080 \
  -e DATABASE_URL="postgresql://nobody:nobody@127.0.0.1:5432/nodb" \
  -e SESSION_SECRET="preflight-only-not-a-real-secret-32chars" \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_FEATURE_SSO=1 -e NEXT_PUBLIC_FEATURE_GRAPH=1 -e NEXT_PUBLIC_FEATURE_TRACKING=1 \
  spark-kms:latest
# open http://localhost:8081/login — the Microsoft button must be there
docker rm -f spark-preflight
```
The bogus `DATABASE_URL` is fine: the login page never touches the database.

### Rollback
Deployments are immutable and numbered. To go back, redeploy the previous image
tag the same way (`:spark-kms.app.N-1`) — the env block is unchanged, only the
image reference moves.

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

## Integration API & MCP (Phase 5)

The app exposes a Bearer-authenticated integration surface — no new env vars or
infra; it rides the same container + DB.

- **Keys**: super-admin mints them in the app (Admin → API keys). Stored SHA-256
  hashed; scopes `read` / `write`; shown once; revocable. Per-key limit 60 req/min.
- **REST**: `/api/v1/*` (initiatives list/detail/create, entries, dashboard,
  leaderboard, top-initiatives). Spec at `/api/openapi.json` (OpenAPI 3.1,
  generated from the Zod validators); human docs at `/api/docs` (Scalar).
- **MCP**: streamable HTTP at `/api/mcp` (7 tools), same keys/scopes/behavior as
  REST. Connect a client with header `Authorization: Bearer <key>`.
- **Schema**: Phase 5 added the `api_keys` table (migration `0001_api_keys`) — an
  additive change. Apply it with the "Run a database migration" steps below
  before deploying the Phase 5 image.

## Operations
- **HTTPS**: automatic on the Lightsail URL. Custom domain: Lightsail console →
  the container service → Custom domains → add + create the DNS record.
- **Backups**: Lightsail DB automated backups (enable/adjust in console). Manual
  snapshot: `aws lightsail create-relational-database-snapshot`.
- **Logs**: `aws lightsail get-container-log --service-name spark-kms --container-name app`.
- **Rotate SESSION_SECRET**: change it in the deployment env → redeploy (logs
  everyone out). Rotate the **viewer password in-app** (Admin → Viewer password).
- **Scale**: raise `--scale` or move to `medium` power (1 vCPU / 2 GB) if 1 GB
  gets tight under load. **Changing power means changing the heap cap**: the
  Dockerfile's runtime stage pins `NODE_OPTIONS=--max-old-space-size=768` at
  ~75% of the `small` power's 1 GB (D31). Left at 768 on a `medium` container
  the app simply never uses the extra GB; raised above the container's RAM, an
  OOM becomes a silent kernel SIGKILL with no log line — which is exactly the
  failure D31 fixed. Update it in the same commit as the power change.
- **Cost**: container `small` $15/mo + DB `micro` $15/mo ≈ **$30/mo** flat.
