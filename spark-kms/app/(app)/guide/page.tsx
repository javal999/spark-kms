import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/src/lib/session";
import { isAdmin, isSuper } from "@/src/lib/session-config";
import { flags } from "@/src/lib/flags";
import {
  REGIONS,
  SEGMENTS,
  PILLARS,
  CATEGORIES,
  STAGES,
} from "@/src/lib/enums";
import { SCORING_RULES, STREAM_LABELS } from "@/src/services/scoring";
import { TEMPLATE_COLUMNS, DEFAULT_TEMPLATE_VERSION } from "@/src/services/template";
import { MAX_UPLOAD_ROWS, MAX_UPLOAD_BYTES } from "@/src/services/upload";
import { DEFAULT_DEDUP_THRESHOLD } from "@/src/services/duplicates";
import {
  t,
  resolveLang,
  type Lang,
  type GuideKey,
} from "@/src/content/guide-copy";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "How SPARK works · SPARK" };

/**
 * "How SPARK works" — the plain-language rulebook for admins: what earns
 * points, what every field means, and how each number on screen is worked out.
 * Admin and super-admin.
 *
 * Point values, enum lists, upload columns and limits are READ from the modules
 * that own them, never retyped, so a number here cannot silently disagree with
 * the code. tests/unit/guide.test.ts pins those values, so changing one fails
 * the suite until this page and the requirements doc are updated with it.
 *
 * D29: the prose lives in src/content/guide-copy.ts in English and Indonesian,
 * chosen by `?lang=`. This file owns the structure — which sections exist, which
 * values are rendered and where — and the copy module owns the words. The values
 * above are language-neutral by design: they are data, and they read the same in
 * both languages.
 *
 * The super-only /admin/overview is the technical companion to this page.
 */

type SP = Record<string, string | string[] | undefined>;

/** The only markup a copy string may carry: **bold**. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
      )}
    </>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-lg border bg-card p-5">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

function Values({ items }: { items: readonly string[] }) {
  return (
    <span className="font-medium text-foreground">{items.join(" · ")}</span>
  );
}

const CONTENTS: { id: string; key: GuideKey }[] = [
  { id: "what", key: "toc.what" },
  { id: "roles", key: "toc.roles" },
  { id: "points", key: "toc.points" },
  { id: "corrections", key: "toc.corrections" },
  { id: "submitting", key: "toc.submitting" },
  { id: "upload", key: "toc.upload" },
  { id: "duplicates", key: "toc.duplicates" },
  { id: "leaderboard", key: "toc.leaderboard" },
  { id: "dashboard", key: "toc.dashboard" },
  { id: "everything", key: "toc.everything" },
  { id: "changes", key: "toc.changes" },
];

/** Each earning event, paired with its live rule. Prose lives in the copy module. */
const EARNING = [
  {
    reason: "new_initiative",
    what: "earn.new_initiative.what",
    rule: "earn.new_initiative.rule",
  },
  { reason: "entry", what: "earn.entry.what", rule: "earn.entry.rule" },
  {
    reason: "bp_of_week",
    what: "earn.bp_of_week.what",
    rule: "earn.bp_of_week.rule",
  },
] as const satisfies readonly {
  reason: keyof typeof SCORING_RULES;
  what: GuideKey;
  rule: GuideKey;
}[];

/** Role capabilities. The row label is translated; the role names are not. */
const ROLE_ROWS: { key: GuideKey; allowed: [boolean, boolean, boolean] }[] = [
  { key: "roles.row.read", allowed: [true, true, true] },
  { key: "roles.row.add", allowed: [false, true, true] },
  { key: "roles.row.upload", allowed: [false, true, true] },
  { key: "roles.row.archive", allowed: [false, true, true] },
  { key: "roles.row.adjust", allowed: [false, true, true] },
  { key: "roles.row.insights", allowed: [false, true, true] },
  { key: "roles.row.manage", allowed: [false, false, true] },
  { key: "roles.row.graph", allowed: [false, false, true] },
];

/** Submit-form fields. Field names stay English — they are the labels on the form. */
const SUBMIT_FIELDS: { field: string; required: boolean; key: GuideKey }[] = [
  { field: "Region", required: true, key: "submit.region" },
  { field: "Segment", required: true, key: "submit.segment" },
  { field: "Topic / title", required: true, key: "submit.title" },
  { field: "Description", required: false, key: "submit.description" },
  { field: "Pillar", required: true, key: "submit.pillar" },
  { field: "PIC", required: true, key: "submit.pic" },
  { field: "Stage", required: false, key: "submit.stage" },
  { field: "Date", required: true, key: "submit.date" },
  { field: "Category", required: true, key: "submit.category" },
  { field: "Progress detail", required: true, key: "submit.progress" },
  { field: "Follow-up needed", required: false, key: "submit.followup" },
  { field: "Best Practice of the Week", required: false, key: "submit.bpow" },
  { field: "Link", required: false, key: "submit.link" },
];

function LangToggle({ lang }: { lang: Lang }) {
  const options: { value: Lang; label: string; href: string }[] = [
    { value: "en", label: t("lang.en", lang), href: "/guide" },
    { value: "id", label: t("lang.id", lang), href: "/guide?lang=id" },
  ];
  return (
    <div
      className="flex items-center gap-1 rounded-md border bg-muted/30 p-1"
      aria-label={t("lang.label", lang)}
      data-testid="guide-lang"
    >
      {options.map((o) => (
        <Link
          key={o.value}
          href={o.href}
          aria-current={o.value === lang ? "true" : undefined}
          className={
            o.value === lang
              ? "rounded bg-background px-2 py-1 text-xs font-medium shadow-sm"
              : "rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          }
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export default async function GuidePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await readSession();
  // Defence-in-depth: proxy.ts also gates /guide to admin-or-super.
  if (!isAdmin(session.role)) redirect("/");
  const superAdmin = isSuper(session.role);

  const sp = await searchParams;
  const langParam = Array.isArray(sp.lang) ? sp.lang[0] : sp.lang;
  const lang = resolveLang(langParam);
  const suffix = lang === "en" ? "" : `?lang=${lang}`;

  const maxUploadMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
  const dedupPercent = Math.round(DEFAULT_DEDUP_THRESHOLD * 100);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("page.title", lang)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("page.intro", lang)}
          </p>
        </div>
        <LangToggle lang={lang} />
      </div>

      <nav
        className="rounded-lg border bg-muted/30 p-4"
        aria-label={t("nav.heading", lang)}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("nav.heading", lang)}
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {CONTENTS.map((c) => (
            <li key={c.id}>
              <Link
                href={`${suffix}#${c.id}`}
                className="text-foreground/80 hover:underline"
              >
                {t(c.key, lang)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="what" title={t("sec.what", lang)}>
        <p>
          <Rich text={t("what.p1", lang)} />
        </p>
        <p>
          <Rich text={t("what.p2", lang)} />
        </p>
        <p>
          <Rich text={t("what.p3", lang)} />
        </p>
      </Section>

      <Section id="roles" title={t("sec.roles", lang)}>
        <p>
          <Rich text={t("roles.p1", lang)} />
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("roles.col.can", lang)}</TableHead>
                <TableHead className="text-center">
                  {t("roles.col.viewer", lang)}
                </TableHead>
                <TableHead className="text-center">
                  {t("roles.col.admin", lang)}
                </TableHead>
                <TableHead className="text-center">
                  {t("roles.col.super", lang)}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROLE_ROWS.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="whitespace-normal">
                    {t(row.key, lang)}
                  </TableCell>
                  {row.allowed.map((allowed, i) => (
                    <TableCell key={i} className="text-center">
                      {allowed ? t("roles.yes", lang) : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p>
          <Rich text={t("roles.p2", lang)} />
        </p>
      </Section>

      <Section id="points" title={t("sec.points", lang)}>
        <p>
          <Rich
            text={t("points.p1", lang, {
              bp: STREAM_LABELS.best_practice,
              contrib: STREAM_LABELS.presenter,
            })}
          />
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("points.col.what", lang)}</TableHead>
                <TableHead className="w-20 text-right">
                  {t("points.col.points", lang)}
                </TableHead>
                <TableHead className="w-32">
                  {t("points.col.stream", lang)}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {EARNING.map((e) => {
                const rule = SCORING_RULES[e.reason];
                return (
                  <TableRow key={e.reason}>
                    {/* ui/table cells are whitespace-nowrap by default; these
                        hold sentences, so they have to wrap. */}
                    <TableCell className="align-top whitespace-normal">
                      <div className="font-medium">{t(e.what, lang)}</div>
                      <div className="mt-1 text-muted-foreground">
                        {t(e.rule, lang)}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-right font-semibold tabular-nums">
                      +{rule.points}
                    </TableCell>
                    <TableCell className="align-top">
                      {STREAM_LABELS[rule.stream]}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p>
          <Rich text={t("points.p2", lang)} />
        </p>
        <p>
          <Rich text={t("points.p3", lang)} />
        </p>
      </Section>

      <Section id="corrections" title={t("sec.corrections", lang)}>
        <p>
          <Rich text={t("corrections.p1", lang)} />
        </p>
        <p>
          <Rich text={t("corrections.p2", lang)} />
        </p>
        <p>
          <Rich text={t("corrections.p3", lang)} />
        </p>
      </Section>

      <Section id="submitting" title={t("sec.submitting", lang)}>
        <p>
          <Rich text={t("submitting.p1", lang)} />
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">
                  {t("submit.col.field", lang)}
                </TableHead>
                <TableHead className="w-24">
                  {t("submit.col.required", lang)}
                </TableHead>
                <TableHead>{t("submit.col.means", lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SUBMIT_FIELDS.map((f) => (
                <TableRow key={f.field}>
                  <TableCell className="align-top font-medium">
                    {f.field}
                  </TableCell>
                  <TableCell className="align-top">
                    {f.required
                      ? t("submit.required.yes", lang)
                      : t("submit.required.no", lang)}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal text-muted-foreground">
                    {t(f.key, lang)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p>{t("submitting.p2", lang)}</p>
        {/* Field names and their values are data: identical in both languages. */}
        <ul className="list-disc space-y-1 pl-5">
          <li>Region: <Values items={REGIONS} /></li>
          <li>Segment: <Values items={SEGMENTS} /></li>
          <li>Pillar: <Values items={PILLARS} /></li>
          <li>Category: <Values items={CATEGORIES} /></li>
          <li>Stage: <Values items={STAGES} /></li>
        </ul>
      </Section>

      <Section id="upload" title={t("sec.upload", lang)}>
        <p>
          <Rich
            text={t("upload.p1", lang, { version: DEFAULT_TEMPLATE_VERSION })}
          />
        </p>
        <p>{t("upload.p2", lang)}</p>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 pl-5 sm:grid-cols-2 [&>li]:list-disc">
          {TEMPLATE_COLUMNS.map((c) => (
            <li key={c} className="ml-0 list-disc">
              {c}
            </li>
          ))}
        </ul>
        <p>
          <Rich text={t("upload.p3", lang)} />
        </p>
        <p>
          <Rich
            text={t("upload.p4", lang, {
              rows: MAX_UPLOAD_ROWS,
              mb: maxUploadMb,
            })}
          />
        </p>
      </Section>

      <Section id="duplicates" title={t("sec.duplicates", lang)}>
        <p>
          <Rich text={t("duplicates.p1", lang, { pct: dedupPercent })} />
        </p>
        <p>
          <Rich text={t("duplicates.p2", lang)} />
        </p>
      </Section>

      <Section id="leaderboard" title={t("sec.leaderboard", lang)}>
        <p>
          <Rich text={t("leaderboard.p1", lang)} />
        </p>
        <p>
          <Rich text={t("leaderboard.p2", lang)} />
        </p>
        <p>
          <Rich text={t("leaderboard.p3", lang)} />
        </p>
        <p>
          <Rich text={t("leaderboard.p4", lang)} />
        </p>
      </Section>

      <Section id="dashboard" title={t("sec.dashboard", lang)}>
        <p>
          <Rich text={t("dashboard.p1", lang)} />
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <Rich text={t("dashboard.li.total", lang)} />
          </li>
          <li>
            <Rich text={t("dashboard.li.new", lang)} />
          </li>
          <li>
            <Rich text={t("dashboard.li.existing", lang)} />
          </li>
          <li>
            <Rich text={t("dashboard.li.unlockings", lang)} />
          </li>
          <li>
            <Rich text={t("dashboard.li.groupings", lang)} />
          </li>
        </ul>
        <p>
          <Rich text={t("dashboard.p2", lang)} />
        </p>
      </Section>

      <Section id="everything" title={t("sec.everything", lang)}>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <Rich text={t("everything.li.initiatives", lang)} />
          </li>
          <li>
            <Rich text={t("everything.li.detail", lang)} />
          </li>
          <li>
            <Rich text={t("everything.li.actions", lang)} />
          </li>
          <li>
            <Rich text={t("everything.li.tags", lang)} />
          </li>
          <li>
            <Rich text={t("everything.li.archive", lang)} />
          </li>
          {flags.tracking && (
            <li>
              <Rich text={t("everything.li.insights", lang)} />
            </li>
          )}
          {flags.graph && (
            <li>
              <Rich
                text={t("everything.li.graph", lang, {
                  access: superAdmin
                    ? t("everything.graph.access.yes", lang)
                    : t("everything.graph.access.no", lang),
                })}
              />
            </li>
          )}
          <li>
            <Rich text={t("everything.li.admin", lang)} />
          </li>
        </ul>
      </Section>

      <Section id="changes" title={t("sec.changes", lang)}>
        <p>
          <Rich text={t("changes.p1", lang)} />
        </p>
        <p>
          <Rich text={t("changes.p2", lang)} />
        </p>
      </Section>

      {superAdmin && (
        <p className="text-sm text-muted-foreground">
          {t("overview.prompt", lang)}{" "}
          <Link href="/admin/overview" className="underline hover:text-foreground">
            {t("overview.link", lang)}
          </Link>
          .
        </p>
      )}
    </div>
  );
}
