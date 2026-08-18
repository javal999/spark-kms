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
 * The super-only /admin/overview is the technical companion to this page.
 */

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

const CONTENTS: { id: string; label: string }[] = [
  { id: "what", label: "What SPARK is" },
  { id: "roles", label: "Who can do what" },
  { id: "points", label: "How points work" },
  { id: "corrections", label: "Correcting a score" },
  { id: "submitting", label: "Submitting" },
  { id: "upload", label: "Bulk upload" },
  { id: "duplicates", label: "Duplicate detection" },
  { id: "leaderboard", label: "The leaderboard" },
  { id: "dashboard", label: "The dashboard" },
  { id: "everything", label: "Everything else" },
  { id: "changes", label: "Changing a rule" },
];

/** Plain-language name for each earning event, paired with its live rule. */
const EARNING = [
  {
    reason: "new_initiative",
    what: "You add a new initiative",
    rule: "Counted once, when the initiative is created. The first progress update you write at the same time is included in this point, so creating an initiative earns one point in total, not two.",
  },
  {
    reason: "entry",
    what: "You add a progress update to an initiative that already exists",
    rule: "Only the first update you add to that initiative on a given date counts. Three updates on the same initiative on the same day still earn one point. Best Practice and Unlocking earn the same — naming a blocker is worth as much as reporting a win.",
  },
  {
    reason: "bp_of_week",
    what: "Your update is marked Best Practice of the Week",
    rule: "Awarded straight away when the box is ticked, with no separate confirmation step. Only one can be awarded per area per week — the first one ticked in that area that week takes it, and later ones score nothing.",
  },
] as const;

const SUBMIT_FIELDS: { field: string; required: string; means: string }[] = [
  { field: "Region", required: "Yes", means: "Where the work happened. Half of the area your points land in." },
  { field: "Segment", required: "Yes", means: "Which brand segment the work belongs to. The other half of the area." },
  { field: "Topic / title", required: "Yes", means: "What the initiative is, in a few words. This is what gets checked for duplicates, so write it the way a colleague would search for it." },
  { field: "Description", required: "No", means: "Background on the initiative as a whole. Write it once, when you create it." },
  { field: "Pillar", required: "Yes", means: "Which strategic pillar the initiative serves. Set on the initiative, not on each update." },
  { field: "PIC", required: "Yes", means: "The person accountable for it. Anyone new here is added to the people directory automatically." },
  { field: "Stage", required: "No", means: "How far along it is. Left blank, it starts at Idea." },
  { field: "Date", required: "Yes", means: "The date the progress happened, not the date you type it in. Backdating is allowed; more than 30 days back shows a warning but still saves." },
  { field: "Category", required: "Yes", means: "Whether this update is a Best Practice or an Unlocking." },
  { field: "Progress detail", required: "Yes", means: "What actually happened. This is the knowledge other regions come here to read." },
  { field: "Follow-up needed", required: "No", means: "Anything still outstanding. Filling this in creates an action item, assigned to the PIC." },
  { field: "Best Practice of the Week", required: "No", means: "Tick only if this is the one you are putting forward for the week. It awards points immediately." },
  { field: "Link", required: "No", means: "A deck, photo or file that backs up the update." },
];

export default async function GuidePage() {
  const session = await readSession();
  // Defence-in-depth: proxy.ts also gates /guide to admin-or-super.
  if (!isAdmin(session.role)) redirect("/");
  const superAdmin = isSuper(session.role);

  const maxUploadMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
  const dedupPercent = Math.round(DEFAULT_DEDUP_THRESHOLD * 100);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">How SPARK works</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every rule and every capability, in plain language. The numbers on
          this page are read from the running system, so what you see here is
          what the app is actually doing.
        </p>
      </div>

      <nav className="rounded-lg border bg-muted/30 p-4" aria-label="On this page">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          On this page
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {CONTENTS.map((c) => (
            <li key={c.id}>
              <Link href={`#${c.id}`} className="text-foreground/80 hover:underline">
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="what" title="What SPARK is">
        <p>
          SPARK is the shared record of what the regions are trying, what is
          working, and what is stuck. It replaced the weekly update spreadsheet.
          Everything that used to live in a row of that sheet now lives here as
          an <strong>initiative</strong> with a running history of{" "}
          <strong>progress updates</strong> attached to it.
        </p>
        <p>
          Three things sit on top of that record: a searchable library so a
          region can find what another region already tried, a point system that
          recognises the people keeping it current, and an area leaderboard that
          shows which parts of the business are contributing.
        </p>
        <p>
          It is not a performance appraisal tool and not a task tracker. Points
          measure how much knowledge you put in, not how well the initiative
          performed.
        </p>
      </Section>

      <Section id="roles" title="Who can do what">
        <p>
          Everyone signs in with their Microsoft work account. Only accounts on
          the access list can get in, and that list also decides which of the
          three roles you get.
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Can</TableHead>
                <TableHead className="text-center">Viewer</TableHead>
                <TableHead className="text-center">Admin</TableHead>
                <TableHead className="text-center">Super admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["Read initiatives, leaderboard, dashboard", true, true, true],
                ["Add initiatives and progress updates", false, true, true],
                ["Bulk upload a spreadsheet", false, true, true],
                ["Archive and restore an initiative", false, true, true],
                ["Correct a score with an adjustment", false, true, true],
                ["See usage insights", false, true, true],
                ["Manage access, API keys and the error log", false, false, true],
                ["Open the knowledge graph", false, false, true],
              ].map(([label, v, a, s]) => (
                <TableRow key={label as string}>
                  <TableCell className="whitespace-normal">
                    {label as string}
                  </TableCell>
                  {[v, a, s].map((allowed, i) => (
                    <TableCell key={i} className="text-center">
                      {allowed ? "Yes" : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p>
          If a colleague loses their access, the change takes effect on their
          very next click, not whenever their session happens to expire.
        </p>
      </Section>

      <Section id="points" title="How points work">
        <p>
          There are two point streams, and they mean different things.{" "}
          <strong>{STREAM_LABELS.best_practice}</strong> holds the weekly award
          and nothing else. <strong>{STREAM_LABELS.presenter}</strong>{" "}
          holds every point you earn by keeping the record up to date. An
          area&apos;s total is simply the two added together.
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>What you did</TableHead>
                <TableHead className="w-20 text-right">Points</TableHead>
                <TableHead className="w-32">Stream</TableHead>
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
                      <div className="font-medium">{e.what}</div>
                      <div className="mt-1 text-muted-foreground">{e.rule}</div>
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
          Nothing else earns points automatically. There is no point for simply
          presenting, and there is no weekly points allocation an admin hands
          out. If a number moved, one of the three rows above caused it, or
          somebody posted an adjustment.
        </p>
        <p>
          <strong>Best Presenter of the Week has been retired.</strong> The award
          is gone from the form and from the upload template, and every point it
          ever granted has been taken back, so no initiative still carries one.
          Area totals dropped by exactly the number of those awards. The old
          records are kept so the history can still be read, they just no longer
          count.
        </p>
      </Section>

      <Section id="corrections" title="Correcting a score">
        <p>
          Scores are kept as a list of everything that ever happened, and that
          list is only ever added to. Nothing is edited and nothing is deleted.
          When something has to be undone, an opposite entry is written next to
          it that cancels it out, and both stay visible.
        </p>
        <p>
          That is why totals are never stored anywhere: every number you see is
          added up fresh from that list each time the page loads. It also means
          the answer to &ldquo;why does this area have this many points?&rdquo;
          is always available in full.
        </p>
        <p>
          If a score is wrong, any admin can post an <strong>adjustment</strong>{" "}
          from the Adjustments page. You choose the area, the stream and the
          number of points, positive or negative, and you must write a note
          saying why. The note and your name are kept with it. This is the
          proper route for a dispute from a region — do not work around it by
          adding an initiative that did not happen.
        </p>
      </Section>

      <Section id="submitting" title="Submitting an initiative or an update">
        <p>
          The Submit page has two paths. <strong>New initiative</strong> creates
          the topic and its first progress update together. <strong>Add to an
          existing initiative</strong> attaches an update to something already in
          the library. Which one you pick decides the points, so search before
          you create.
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">Field</TableHead>
                <TableHead className="w-24">Required</TableHead>
                <TableHead>What it means</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SUBMIT_FIELDS.map((f) => (
                <TableRow key={f.field}>
                  <TableCell className="align-top font-medium">{f.field}</TableCell>
                  <TableCell className="align-top">{f.required}</TableCell>
                  <TableCell className="align-top whitespace-normal text-muted-foreground">
                    {f.means}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p>
          The dropdowns accept these values and nothing else, because the
          leaderboard and the filters only work if everyone uses the same words:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Region: <Values items={REGIONS} /></li>
          <li>Segment: <Values items={SEGMENTS} /></li>
          <li>Pillar: <Values items={PILLARS} /></li>
          <li>Category: <Values items={CATEGORIES} /></li>
          <li>Stage: <Values items={STAGES} /></li>
        </ul>
      </Section>

      <Section id="upload" title="Bulk upload">
        <p>
          To load a batch, download the template from the Submit page and fill
          in the Entries sheet. One row is one progress update on one date, the
          same shape as the old weekly sheet. Use the template rather than your
          own file: its dropdowns are generated from the live lists above, so
          they cannot go out of date. The current version is{" "}
          <strong>{DEFAULT_TEMPLATE_VERSION}</strong>, and an older file still
          uploads — the columns are matched by their heading, not their
          position, so you get a warning rather than a rejection.
        </p>
        <p>The template columns are:</p>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 pl-5 sm:grid-cols-2 [&>li]:list-disc">
          {TEMPLATE_COLUMNS.map((c) => (
            <li key={c} className="ml-0 list-disc">
              {c}
            </li>
          ))}
        </ul>
        <p>
          Uploading happens in two steps. First a <strong>preview</strong>:
          nothing is saved, and you get a row-by-row report of anything invalid
          plus any rows that look like something already in the library. Then a{" "}
          <strong>commit</strong>, which is all or nothing — if one row fails,
          the whole file is rejected and you fix and re-upload. Before you can
          commit, you must tick the box confirming you reviewed the similar
          initiatives it found.
        </p>
        <p>
          {/* One string, so no JSX text-node boundary can eat the spacing
              around the interpolated limits. */}
          {`Limits: ${MAX_UPLOAD_ROWS} rows and ${maxUploadMb} MB per file. The same file cannot be committed twice, so an accidental double upload is blocked rather than doubling everyone’s points. Ticking Best Practice of the Week on every row does not multiply the award, because the one-per-area-per-week cap still applies.`}
        </p>
      </Section>

      <Section id="duplicates" title="Duplicate detection">
        <p>
          Whenever a new topic is about to be created, by form or by upload,
          SPARK compares its title against every initiative already in the
          library. It ignores capitals and punctuation and looks for overlapping
          fragments of text, so &ldquo;Pop-up store Make Over&rdquo; and
          &ldquo;pop up store makeover&rdquo; find each other.{" "}
          {`Anything more than about ${dedupPercent}% similar is shown to you, up to three suggestions, closest first.`}
        </p>
        <p>
          Nothing is ever merged automatically. You are being asked one question:
          is this the same topic as one of these, or genuinely new? Choosing an
          existing one attaches your update to it and earns the update point.
          Choosing new creates a fresh initiative. Getting this right is what
          keeps one region&apos;s work findable by another, which is the whole
          point of the library.
        </p>
      </Section>

      <Section id="leaderboard" title="How the leaderboard is worked out">
        <p>
          The leaderboard ranks <strong>areas</strong>, not people. An area is
          one region paired with one segment, so &ldquo;Sumatera · Masstige&rdquo;
          is a different area from &ldquo;Sumatera · Halal PC&rdquo;. Only areas
          that have at least one initiative appear at all.
        </p>
        <p>
          Each row adds up every point earned in that area, split across the two
          streams, with the total being the two combined. Areas with the same
          total share a rank. Archived initiatives and their points drop out of
          the count.
        </p>
        <p>
          The week filter uses the date the work happened, not the date it was
          typed in, so backdating an update puts the point in the week it
          belongs to. Weeks run <strong>Monday to Sunday, Jakarta time</strong>,
          for everyone, whichever time zone you are reading from.
        </p>
        <p>
          If an initiative&apos;s region or segment is later corrected, points
          already earned stay with the area that earned them, and only new
          points go to the new area. Past weeks therefore do not change
          retrospectively.
        </p>
      </Section>

      <Section id="dashboard" title="How the dashboard numbers are worked out">
        <p>
          Every number on the dashboard counts <strong>initiatives</strong>, not
          points or updates, and every one of them excludes archived
          initiatives. Each is clickable and opens the list filtered to exactly
          the initiatives it counted, which is the quickest way to check one.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Total initiatives</strong> — every initiative in the library
            right now.
          </li>
          <li>
            <strong>New this week</strong> — those created since Monday, Jakarta
            time. This one uses the date it was entered, not the date of the
            work.
          </li>
          <li>
            <strong>Existing</strong> — the total minus the new ones.
          </li>
          <li>
            <strong>Open unlockings</strong> — initiatives that have at least one
            update logged as an Unlocking.
          </li>
          <li>
            <strong>By stage, pillar, region and segment</strong> — the same set
            of initiatives grouped four different ways, so each of those four
            groupings adds up to the total.
          </li>
        </ul>
        <p>
          <strong>Weekly Top Initiatives</strong> is the exception: it ranks by
          points rather than by count. It shows the initiatives that earned the
          most in the selected week, defaulting to this week, and you can switch
          it to all-time.
        </p>
      </Section>

      <Section id="everything" title="Everything else on the site">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Initiatives</strong> — the full library, searchable by title,
            description and update text, and filterable by region, segment,
            pillar, stage and how much follow-up is still open.
          </li>
          <li>
            <strong>Initiative detail</strong> — the whole history of one topic:
            every update in date order, its points, its stage, its tags, its
            action items, and the other initiatives it connects to. Stage can be
            moved as the work progresses.
          </li>
          <li>
            <strong>Action items</strong> — created from the follow-up field and
            assigned to the PIC. They move through Not Started, On Progress,
            Done and Withdrawn/Cancelled, and drive the follow-up filter on the
            list.
          </li>
          <li>
            <strong>Tag and people pages</strong> — open a tag or a PIC from any
            initiative to see everything else carrying it.
          </li>
          <li>
            <strong>Archive</strong> — an admin can archive an initiative from
            its detail page. It disappears from lists, the dashboard, the
            leaderboard and duplicate matching, but nothing is destroyed and
            restoring puts it back exactly as it was.
          </li>
          {flags.tracking && (
            <li>
              <strong>Insights</strong> — which pages and initiatives are
              actually being used. Pseudonymous: it records that something was
              opened, never who opened it.
            </li>
          )}
          {flags.graph && (
            <li>
              <strong>Graph</strong> ({superAdmin ? "you have access" : "super admin only"})
              {" "}— a map of how initiatives connect through shared tags, shared
              people and explicit links.
            </li>
          )}
          <li>
            <strong>Admin</strong> (super admin only) — access list, the PIC
            directory, API keys for other systems, the viewer password, the
            template, archived initiatives, and the error and slow-request logs.
          </li>
        </ul>
      </Section>

      <Section id="changes" title="When a rule needs to change">
        <p>
          This page describes the rules; it does not decide them. The approved
          requirements document is the source of truth, and every change to
          scoring or to one of the dropdown lists is recorded there as a numbered
          decision before it is built.
        </p>
        <p>
          So if a point value or a list here looks wrong, it is a question for
          the SPARK owner rather than something to work around. When a rule does
          change, the requirements document, the system, and this page are
          updated together in the same change — that is enforced by a test, so
          this page cannot quietly fall behind.
        </p>
      </Section>

      {superAdmin && (
        <p className="text-sm text-muted-foreground">
          Looking for the technical picture — stack, deployment, observability?
          See the{" "}
          <Link href="/admin/overview" className="underline hover:text-foreground">
            System overview
          </Link>
          .
        </p>
      )}
    </div>
  );
}
