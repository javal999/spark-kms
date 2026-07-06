import { redirect } from "next/navigation";
import { readSession } from "@/src/lib/session";
import { getViewerEpoch } from "@/src/services/auth";
import { Nav } from "@/components/nav";

/**
 * Shell for all authenticated pages. The proxy already gates these routes;
 * this layout re-reads the session (defense in depth) and renders the nav.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  if (!session.role) redirect("/login");

  // Viewer sessions carry the rotation epoch; a stale one (after the super-admin
  // rotated the viewer password) is logged out (REQ-A1). Only viewers pay the
  // extra read.
  if (session.role === "viewer") {
    const epoch = await getViewerEpoch();
    if ((session.viewerEpoch ?? 0) !== epoch) redirect("/api/auth/logout");
  }

  return (
    <div className="flex min-h-full flex-col">
      <Nav role={session.role} name={session.name} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
