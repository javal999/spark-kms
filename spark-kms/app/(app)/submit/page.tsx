import { SubmitForm } from "@/components/submit-form";
import { BulkUpload } from "@/components/bulk-upload";
import { jakartaDate } from "@/src/services/week";

/** Submit page (admin-gated by proxy). Direct form + bulk Excel upload. */
export default function SubmitPage() {
  // Jakarta "today" for the entry-date default. Computed here, not in the
  // client: date/week logic is server-side only (CLAUDE.md), and this value
  // becomes effective_date on a scored event.
  const today = jakartaDate(new Date());
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Submit</h1>
        <p className="text-sm text-muted-foreground">
          Record a best practice or unlocking against an initiative.
        </p>
      </div>
      <SubmitForm today={today} />
      <BulkUpload />
    </div>
  );
}
