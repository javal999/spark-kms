import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/src/lib/session";
import { isSuper } from "@/src/lib/session-config";

export const metadata = { title: "System overview · SPARK" };

/**
 * Super-admin "System overview" — a curated, maintained map of how SPARK works.
 * The in-app knowledge surface (the local understand-anything graph is the
 * deeper engineer-handover tool). Keep this page in step with real changes.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

export default async function SystemOverviewPage() {
  const session = await readSession();
  if (!isSuper(session.role)) redirect("/"); // defence-in-depth (proxy also gates /admin/*)

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">System overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How SPARK is built and behaves — for super-admins and engineer handover.
          A curated summary; the full code-level knowledge graph is generated
          separately (understand-anything, run at handover).
        </p>
      </div>

      <Section title="What it is">
        <p>
          An internal knowledge base that replaced the SPARK weekly-update
          spreadsheet: an initiative library, a 2-stream point system, and a
          Region × Segment area leaderboard. Stack: Next.js 16 (App Router),
          Postgres + Drizzle ORM, iron-session auth, hosted on AWS Lightsail
          (container service + managed Postgres, ap-southeast-1).
        </p>
      </Section>

      <Section title="Roles & sign-in">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Three roles:</strong> <em>viewer</em> (read-only),{" "}
            <em>admin</em> (create/edit, uploads, scoring console),{" "}
            <em>super</em> (everything, incl. this console, access management,
            archive).
          </li>
          <li>
            <strong>M365 SSO (Entra ID)</strong> is the primary login. An
            allow-list (Admin → Access) decides who may sign in and at what role
            — an M365 account not on the list is refused.
          </li>
          <li>
            <strong>Fallbacks:</strong> a shared viewer password, and one local{" "}
            <em>break-glass</em> super-admin (password) for Entra outages.
          </li>
          <li>
            <strong>Enforcement:</strong> the Edge <code>proxy.ts</code> gates
            pages coarsely by cookie role; the Node guards
            (<code>requireAdmin/Super</code>) re-check the live DB role on every
            privileged action, so a revoked admin is blocked immediately.
          </li>
          <li>
            <strong>Integrations</strong> (REST <code>/api/v1/*</code> + MCP) use
            a separate <strong>Bearer API key</strong> — SSO does not apply to
            them.
          </li>
        </ul>
      </Section>

      <Section title="Scoring (event-sourced)">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Every score is a live <strong>SUM over an append-only ledger</strong>{" "}
            (<code>score_events</code>) — totals are never stored.{" "}
            <code>scoring.ts</code> is the only module that writes it.
          </li>
          <li>
            Two streams: <strong>Best Practice</strong> and{" "}
            <strong>Presenter</strong>. New initiative = <strong>+1</strong>{" "}
            (the first entry folds in); later progress entries = +1 each (1/day
            cap); Best-Practice-of-the-Week = +2 (1 per area per week).
          </li>
          <li>
            Nothing is deleted — corrections write a compensating{" "}
            <em>reversal</em> event. History is never rewritten.
          </li>
        </ul>
      </Section>

      <Section title="Bulk upload">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Two-phase: <strong>preview</strong> (dry-run, per-row validation +
            duplicate candidates) → <strong>commit</strong> (all-or-nothing; any
            bad row aborts the whole file — nothing partial is saved).
          </li>
          <li>
            Limits: <strong>500 rows</strong> and <strong>10 MB</strong> per
            file. Duplicate detection is fuzzy (pg_trgm on the normalized title),
            index-backed. Over 10 error rows, a downloadable CSV error report
            appears. Blank required fields are flagged per row, not crashed.
          </li>
        </ul>
      </Section>

      <Section title="Knowledge graph & entities">
        <p>
          Initiatives connect via explicit links, shared tags (co-tag), and
          replicated-from. A multi-entity graph adds people (PICs) and tags as
          nodes, with per-person / per-tag hub pages. AI-suggested links use
          embeddings (OpenRouter) with human confirm — never auto-linked.
          Flag-gated (<code>FEATURE_GRAPH</code>).
        </p>
      </Section>

      <Section title="Archive (super-admin)">
        <p>
          A super-admin can <strong>archive</strong> an initiative from its
          detail page. Archived initiatives are hidden read-time from lists, the
          dashboard, the leaderboard, top-initiatives, the graphs and
          duplicate-matching — but the record and its history stay, and{" "}
          <strong>Restore</strong> brings it back exactly (no score-ledger
          surgery). Archived items are listed under <strong>Admin → Archived</strong>.
        </p>
      </Section>

      <Section title="Observability">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Admin → Error log:</strong> unexpected server errors are
            captured with a <code>err_…</code> trace id shown to the user, so a
            reported code maps to the exact message + stack.
          </li>
          <li>
            <strong>Admin → Slow requests:</strong> requests over 5s are logged,
            so latency creep is visible before it becomes a ~60s gateway timeout.
          </li>
          <li>Usage tracking is pseudonymous (no PII), purged after 90 days.</li>
        </ul>
      </Section>

      <Section title="Deploy & ops">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Lightsail container service <code>spark-kms</code> + managed Postgres
            <code> spark-kms-db</code>. Images build on Colima (amd64), pushed +
            deployed via the <code>~/spark-deploy-*.sh</code> scripts.
          </li>
          <li>
            Drizzle migrations are additive; secrets (SESSION_SECRET, AZURE_*,
            OPENROUTER_API_KEY, CRON_SECRET) live only in the deployment env,
            never in git. Nightly retention cron via GitLab schedule.
          </li>
          <li>
            Every deploy has a brief (~10–15s) 503 window during the container
            swap — retry once and it&apos;s back.
          </li>
        </ul>
      </Section>

      <Section title="Where to look (for engineers)">
        <ul className="list-disc space-y-1 pl-5">
          <li><code>src/services/</code> — business logic (scoring, upload, initiatives, graph, auth).</li>
          <li><code>src/db/schema.ts</code> — the single source of truth for the DB shape.</li>
          <li><code>docs/</code> — the TRDs and task breakdowns (auth/SSO, graph, observability).</li>
          <li>
            Deeper code map: the <code>understand-anything</code> / graphify
            knowledge graph, regenerated at handover (local dev tool, gitignored).
          </li>
        </ul>
      </Section>
    </div>
  );
}
