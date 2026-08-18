import { db } from "@/src/db";
import { appConfig } from "@/src/db/schema";
import { DEFAULT_TEMPLATE_VERSION } from "@/src/services/template";

/**
 * Bump the stored bulk-upload template version so previously-downloaded files
 * are flagged "outdated" (nudging a re-download of the template that now carries
 * the current template column set). Idempotent. Run with the prod
 * DATABASE_URL, e.g. `npx tsx --env-file=<envfile> src/db/set-template-version.ts`.
 */
async function main() {
  const version = DEFAULT_TEMPLATE_VERSION;
  await db
    .insert(appConfig)
    .values({ key: "template_version", value: version })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: version } });
  console.log("template_version →", version);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
