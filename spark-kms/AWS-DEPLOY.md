# Deploying SPARK KMS to AWS (App Runner + RDS)

Runbook for **AWS App Runner** (container) + **RDS PostgreSQL**, existing AWS
account. App Runner gives managed HTTPS, scaling, and load balancing; we supply
a Docker image (built from the repo `Dockerfile`).

You run these steps with your AWS credentials — Claude can't (and shouldn't)
touch your account. Replace `<...>` placeholders. Region assumed
`ap-southeast-1` (Singapore, closest to Indonesia).

Prereqs on your machine: AWS CLI v2 (logged in), Docker, this repo.

```bash
export AWS_REGION=ap-southeast-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export APP=spark-kms
export ECR_URI=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$APP
```

## 1. RDS PostgreSQL
- Create an **RDS for PostgreSQL 16** instance (`db.t4g.micro` is plenty to start),
  in your VPC. Initial database name `spark_kms`. **Not** publicly accessible.
- Enable **automated backups** (retention 7–30 days) → satisfies the daily/30-day
  backup requirement. (Optionally also run `scripts/backup.sh` as a secondary.)
- Note the **endpoint**, master **username/password**, its **VPC/subnets**, and
  its **security group** (call it `sg-rds`).

Connection string used below:
```bash
export DATABASE_URL="postgresql://<user>:<pass>@<rds-endpoint>:5432/spark_kms"
```

## 2. Bootstrap the database (one-time; repeat migrate on schema changes)
Run from a machine that can reach RDS. Simplest: temporarily add an inbound rule
on `sg-rds` for port 5432 from **your IP only**, then remove it after.

```bash
npm ci
npm run db:migrate     # enables pg_trgm + creates the schema + trigram index

# Create the first super-admin + shared viewer password (NOT the dev seed):
ADMIN_EMAIL="you@paragon.co.id" ADMIN_NAME="Your Name" \
ADMIN_PASSWORD='<strong-admin-password>' \
VIEWER_PASSWORD='<shared-viewer-password>' \
npm run db:provision
```
Then delete the temporary security-group rule.

## 3. Secrets (Secrets Manager)
```bash
aws secretsmanager create-secret --name $APP/DATABASE_URL \
  --secret-string "$DATABASE_URL" --region $AWS_REGION
aws secretsmanager create-secret --name $APP/SESSION_SECRET \
  --secret-string "$(openssl rand -base64 32)" --region $AWS_REGION
```
`SESSION_SECRET` must be ≥32 chars and stable — rotating it logs everyone out.

## 4. Build + push the image to ECR
```bash
aws ecr create-repository --repository-name $APP --region $AWS_REGION
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# On Apple Silicon you MUST target amd64 (App Runner default arch):
docker buildx build --platform linux/amd64 -t $ECR_URI:latest --push .
```

## 5. Create the App Runner service
Console → App Runner → Create service:
- **Source:** Container registry → ECR → `spark-kms:latest`. Deploy trigger:
  Manual (or Automatic to redeploy on every new `:latest` push).
- **Port:** `8080`.
- **Environment:** `NODE_ENV=production`; and reference the two secrets
  (`DATABASE_URL`, `SESSION_SECRET`) via App Runner's Secrets Manager integration
  so they arrive as env vars.
- **Instance role:** allow `secretsmanager:GetSecretValue` on those two secrets.
- **Compute:** 1 vCPU / 2 GB.
- **Health check:** HTTP, path `/api/health` (returns 200, no auth, no DB).
- **Networking → Outgoing traffic:** **Custom VPC** → create a **VPC connector**
  in the RDS subnets. Then add an inbound rule on `sg-rds` allowing port 5432
  from the VPC connector's security group. (This is how the running app reaches
  the private RDS.)

## 6. Verify
- Open the App Runner default URL `https://<id>.ap-southeast-1.awsapprunner.com`.
- `/api/health` → `{"ok":true}`. `/login` loads over HTTPS.
- Log in as the provisioned super-admin → create an initiative → confirm it shows
  on the dashboard/leaderboard. Log in with the viewer password (read-only).

## 7. Custom domain (optional)
App Runner → your service → Custom domains → add `spark.paragon.co.id` → create
the shown CNAME/validation records in your DNS. TLS is managed automatically.

## 8. Ongoing operations
- **Redeploy:** `docker buildx build --platform linux/amd64 -t $ECR_URI:latest --push .`
  → App Runner auto-deploys (if enabled) or click *Deploy*.
- **Schema change:** run `npm run db:migrate` (step 2 connection) as part of the
  release, before the new image serves traffic.
- **Secrets:** rotate `SESSION_SECRET` in Secrets Manager → redeploy (everyone
  re-logs in). Rotate the **viewer password in-app** (Admin → Viewer password) —
  no deploy needed.
- **Backups:** RDS automated backups are primary; test a restore quarterly.
- **Rough cost:** App Runner ~$5–25/mo (light use) + RDS `t4g.micro` ~$15/mo +
  minimal ECR/Secrets. Scales with usage.

## Security checklist (AWS)
- [x] RDS **not** publicly accessible; reached only via the App Runner VPC connector.
- [x] Secrets in Secrets Manager, never in the image (`.dockerignore` excludes `.env*`).
- [x] HTTPS enforced by App Runner (secure cookies require it).
- [x] Container runs as non-root (`nextjs` user).
- [x] Dev seed refused in production; first admin via `db:provision`.
