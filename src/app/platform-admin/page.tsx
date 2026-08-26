import { redirect } from "next/navigation";

// Placeholder root — Phase 2 delivers auth resolution/guards only. The real
// Schools directory (search/filter, active-team counts, primary coach) is a
// later phase. This exists so /platform-admin has something to render and
// the layout guard above is exercisable end-to-end without shipping UI that
// hasn't been scoped/reviewed yet.
export default function PlatformAdminRootPage() {
  redirect("/platform-admin/schools");
}
