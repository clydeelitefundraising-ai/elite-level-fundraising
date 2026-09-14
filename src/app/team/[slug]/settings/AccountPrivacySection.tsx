"use client";

import { useState } from "react";
import { ShieldOff, Trash2, ChevronRight } from "lucide-react";
import BlockedUsersModal from "../_components/BlockedUsersModal";
import DeleteAccountModal from "../_components/DeleteAccountModal";

// Apple-review UI polish: Blocked Users and Delete Account used to live
// directly in the AccountMenu flyout — moved here so they're reachable
// from Settings for every role, not just the roles who happened to have
// the flyout open. Both modals are reused completely unchanged; this
// component only decides WHERE the trigger buttons live, never how
// blocking/unblocking or account deletion actually behave.
export default function AccountPrivacySection({ slug }: { slug: string }) {
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <div style={{ marginBottom: ".4rem", marginTop: "1.25rem" }}>
        <span style={{ fontSize: ".65rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".09em" }}>
          Account &amp; Privacy
        </span>
      </div>
      <div style={{
        background: "var(--surface-light)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-app)",
        overflow: "hidden",
      }}>
        <button
          onClick={() => setBlockedOpen(true)}
          className="elf-focus-ring"
          style={rowStyle}
        >
          <ShieldOff size={16} aria-hidden="true" style={{ flexShrink: 0, color: "var(--text-muted-app)" }} />
          <span style={{ flex: 1, textAlign: "left" }}>Blocked Users</span>
          <ChevronRight size={15} aria-hidden="true" style={{ flexShrink: 0, color: "var(--text-muted-app)", opacity: .6 }} />
        </button>
        <div style={{ borderTop: "1px solid var(--border-app)" }} />
        <button
          onClick={() => setDeleteOpen(true)}
          className="elf-focus-ring"
          style={{ ...rowStyle, color: "var(--color-error)" }}
        >
          <Trash2 size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: "left" }}>Delete Account</span>
          <ChevronRight size={15} aria-hidden="true" style={{ flexShrink: 0, opacity: .6 }} />
        </button>
      </div>

      {blockedOpen && <BlockedUsersModal slug={slug} onClose={() => setBlockedOpen(false)} />}
      {deleteOpen && <DeleteAccountModal slug={slug} onClose={() => setDeleteOpen(false)} />}
    </>
  );
}

const rowStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: ".6rem",
  padding: ".75rem .9rem",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: ".84rem",
  fontWeight: 600,
  color: "var(--text-primary-app)",
};
