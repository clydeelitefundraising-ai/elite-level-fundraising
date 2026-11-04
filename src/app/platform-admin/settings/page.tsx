import { requirePlatformAdminPage } from "@/lib/platformAdminPageGuard";
import { navSection } from "@/lib/platformAdminNav";
import SectionHub from "../_components/SectionHub";
import styles from "../_components/SectionHub.module.css";

export const dynamic = "force-dynamic";

// Platform Admin settings: who is signed in, My Teams and account tools.
// The /platform-admin layout has already verified the Platform Admin account.
export default async function PlatformAdminSettingsPage() {
  const admin = await requirePlatformAdminPage();
  return (
    <SectionHub section={navSection("settings")}>
      <div className={styles.panel} style={{ marginBottom: "1rem" }}>
        <div style={{ fontWeight: 700 }}>{admin?.name}</div>
        <div className={styles.cardText}>{admin?.email}</div>
        <div className={styles.cardText} style={{ marginTop: ".4rem" }}>
          Signed in with your own ELF account as a Platform Admin. Your admin actions are recorded under your name in the audit log.
        </div>
      </div>
    </SectionHub>
  );
}
