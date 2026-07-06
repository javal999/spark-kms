import { SubmitForm } from "@/components/submit-form";
import { BulkUpload } from "@/components/bulk-upload";

/** Submit page (admin-gated by proxy). Direct form + bulk Excel upload. */
export default function SubmitPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Submit</h1>
        <p className="text-sm text-muted-foreground">
          Record a best practice or unlocking against an initiative.
        </p>
      </div>
      <SubmitForm />
      <BulkUpload />
    </div>
  );
}
