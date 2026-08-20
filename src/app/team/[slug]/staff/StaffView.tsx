"use client";

import { useEffect, useState } from "react";
import Modal from "../_components/Modal";

type Role = "head_coach" | "assistant_coach" | "booster";
type AssignableRole = "assistant_coach" | "booster";

type StaffRow = {
  id: string;
  name: string;
  role: Role;
  email: string | null;
  account_id: string | null;
  created_at: string;
};

type PendingInvitation = {
  id: string;
  email: string;
  full_name: string;
  role: AssignableRole;
  expires_at: string;
  created_at: string;
};

type ExistingAccount = { id: string; name: string; email: string };

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 9,
  // 16px minimum — iOS WebKit auto-zooms the viewport when focusing a form
  // control smaller than this (Phase 8).
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
  color: "#111827",
  background: "#fff",
};

const lbl: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".3rem",
  fontSize: ".72rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

function roleLabel(role: Role): string {
  if (role === "head_coach") return "Head Coach";
  if (role === "assistant_coach") return "Assistant Coach";
  return "Booster";
}

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div style={{
      width: 38, height: 38, borderRadius: "50%", background: "#0b1e3d",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: ".85rem", color: "#fff", flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

function StaffCard({
  s, canRemove, onRemove,
}: {
  s: StaffRow;
  canRemove: boolean;
  onRemove: (s: StaffRow) => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: ".7rem",
      background: "#fff", borderRadius: 12, padding: ".7rem .85rem",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
    }}>
      <Avatar name={s.name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: ".85rem", color: "#0b1e3d" }}>{s.name}</div>
        <div style={{ fontSize: ".72rem", color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.email ?? roleLabel(s.role)}
        </div>
      </div>
      {canRemove && (
        <button
          onClick={() => onRemove(s)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".72rem", fontWeight: 700, color: "#fca5a5", padding: ".3rem .5rem", borderRadius: 6, flexShrink: 0 }}
        >
          Remove
        </button>
      )}
    </div>
  );
}

function PendingCard({
  inv, onResend, onRevoke, busy,
}: {
  inv: PendingInvitation;
  onResend: (inv: PendingInvitation) => void;
  onRevoke: (inv: PendingInvitation) => void;
  busy: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: ".7rem",
      background: "#fffbeb", borderRadius: 12, padding: ".7rem .85rem",
      border: "1px solid #fde68a",
    }}>
      <div style={{ fontSize: "1.1rem", flexShrink: 0 }}>⏳</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: ".85rem", color: "#0b1e3d" }}>{inv.full_name}</div>
        <div style={{ fontSize: ".72rem", color: "#92400e" }}>
          {inv.email} &middot; {roleLabel(inv.role)} &middot; expires {timeUntil(inv.expires_at)}
        </div>
      </div>
      <div style={{ display: "flex", gap: ".3rem", flexShrink: 0 }}>
        <button
          disabled={busy}
          onClick={() => onResend(inv)}
          style={{ background: "none", border: "none", cursor: busy ? "not-allowed" : "pointer", fontSize: ".72rem", fontWeight: 700, color: "#0b1e3d", padding: ".3rem .4rem", borderRadius: 6 }}
        >
          Resend
        </button>
        <button
          disabled={busy}
          onClick={() => onRevoke(inv)}
          style={{ background: "none", border: "none", cursor: busy ? "not-allowed" : "pointer", fontSize: ".72rem", fontWeight: 700, color: "#dc2626", padding: ".3rem .4rem", borderRadius: 6 }}
        >
          Revoke
        </button>
      </div>
    </div>
  );
}

export default function StaffView({
  slug,
}: {
  slug: string;
}) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [pending, setPending] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [method, setMethod] = useState<"invite" | "temp_password">("invite");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("assistant_coach");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [existingAccount, setExistingAccount] = useState<ExistingAccount | null>(null);

  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/team/${slug}/staff`);
      const data = await res.json();
      if (!res.ok) { setLoadError(data.error ?? "Failed to load staff."); return; }
      setStaff(data.staff ?? []);
      setPending(data.pendingInvitations ?? []);
    } catch {
      setLoadError("Network error loading staff.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const headCoach = staff.find(s => s.role === "head_coach") ?? null;
  const assistantCoaches = staff.filter(s => s.role === "assistant_coach");
  const boosters = staff.filter(s => s.role === "booster");

  const resetForm = () => {
    setMethod("invite");
    setFullName(""); setEmail(""); setRole("assistant_coach"); setPassword("");
    setFormError(""); setExistingAccount(null);
  };

  const openAdd = () => { resetForm(); setShowAdd(true); };
  const closeAdd = () => { setShowAdd(false); resetForm(); };

  const handleSubmit = async () => {
    setFormError("");
    if (!fullName.trim()) { setFormError("Full name is required."); return; }
    if (!email.trim()) { setFormError("Email is required."); return; }
    if (method === "temp_password" && password.length < 8) { setFormError("Password must be at least 8 characters."); return; }

    setSaving(true);
    try {
      if (method === "invite") {
        const res = await fetch(`/api/team/${slug}/staff/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full_name: fullName.trim(), email: email.trim(), role }),
        });
        const data = await res.json();
        if (!res.ok) { setFormError(data.error ?? "Failed to send invitation."); return; }
        if (data.outcome === "existing_account") {
          setExistingAccount(data.account);
          return;
        }
        setSuccessMsg("Invitation sent.");
        closeAdd();
        await load();
      } else {
        const res = await fetch(`/api/team/${slug}/staff`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: "temporary_password", full_name: fullName.trim(), email: email.trim(), role, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.existingAccount) { setExistingAccount(data.existingAccount); return; }
          setFormError(data.error ?? "Failed to create account.");
          return;
        }
        setSuccessMsg("Staff account created.");
        closeAdd();
        await load();
      }
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleAssignExisting = async () => {
    if (!existingAccount) return;
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`/api/team/${slug}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "existing_account", account_id: existingAccount.id, role }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Failed to add this account."); return; }
      setSuccessMsg("Existing account added to the team.");
      closeAdd();
      await load();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (s: StaffRow) => {
    if (!confirm("Remove this staff member from the team? Their ELF account and access to other teams will not be affected.")) return;
    setRowBusy(s.id);
    try {
      const res = await fetch(`/api/team/${slug}/staff/${s.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Failed to remove staff member."); return; }
      setSuccessMsg("Staff member removed from this team.");
      await load();
    } finally {
      setRowBusy(null);
    }
  };

  const handleResend = async (inv: PendingInvitation) => {
    setRowBusy(inv.id);
    try {
      const res = await fetch(`/api/team/${slug}/staff/invitations/${inv.id}/resend`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Failed to resend invitation."); return; }
      setSuccessMsg("Invitation resent.");
      await load();
    } finally {
      setRowBusy(null);
    }
  };

  const handleRevoke = async (inv: PendingInvitation) => {
    if (!confirm(`Revoke the invitation to ${inv.email}? The link will stop working immediately.`)) return;
    setRowBusy(inv.id);
    try {
      const res = await fetch(`/api/team/${slug}/staff/invitations/${inv.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Failed to revoke invitation."); return; }
      setSuccessMsg("Invitation revoked.");
      await load();
    } finally {
      setRowBusy(null);
    }
  };

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(""), 3500);
    return () => clearTimeout(t);
  }, [successMsg]);

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Team Management
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Staff
          </h2>
          <div style={{ flex: 1 }} />
          <button
            onClick={openAdd}
            style={{ padding: ".45rem .85rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".8rem", fontWeight: 700, cursor: "pointer" }}
          >
            + Add Staff Member
          </button>
        </div>
        <p style={{ margin: ".3rem 0 0", fontSize: ".82rem", color: "#6b7280", lineHeight: 1.5 }}>
          Manage the assistant coaches and boosters who help run your team.
        </p>
      </div>

      {successMsg && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 9, padding: ".55rem .75rem", color: "#16a34a", fontSize: ".82rem", fontWeight: 600, marginBottom: ".65rem" }}>
          {successMsg}
        </div>
      )}
      {loadError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: ".55rem .75rem", color: "#dc2626", fontSize: ".82rem", marginBottom: ".65rem" }}>
          {loadError}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem 0", color: "#9ca3af", fontSize: ".85rem" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {/* Head Coach */}
          <div>
            <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".4rem" }}>
              Head Coach
            </div>
            {headCoach && <StaffCard s={headCoach} canRemove={false} onRemove={() => {}} />}
          </div>

          {/* Assistant Coaches */}
          <div>
            <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".4rem" }}>
              Assistant Coaches
            </div>
            {assistantCoaches.length === 0 ? (
              <div style={{ fontSize: ".8rem", color: "#9ca3af", padding: ".3rem 0" }}>No assistant coaches yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                {assistantCoaches.map(s => (
                  <StaffCard key={s.id} s={s} canRemove={rowBusy !== s.id} onRemove={handleRemove} />
                ))}
              </div>
            )}
          </div>

          {/* Boosters */}
          <div>
            <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".4rem" }}>
              Boosters
            </div>
            {boosters.length === 0 ? (
              <div style={{ fontSize: ".8rem", color: "#9ca3af", padding: ".3rem 0" }}>No boosters yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                {boosters.map(s => (
                  <StaffCard key={s.id} s={s} canRemove={rowBusy !== s.id} onRemove={handleRemove} />
                ))}
              </div>
            )}
          </div>

          {/* Pending Invitations */}
          <div>
            <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".4rem" }}>
              Pending Invitations
            </div>
            {pending.length === 0 ? (
              <div style={{ fontSize: ".8rem", color: "#9ca3af", padding: ".3rem 0" }}>No pending invitations.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                {pending.map(inv => (
                  <PendingCard key={inv.id} inv={inv} onResend={handleResend} onRevoke={handleRevoke} busy={rowBusy === inv.id} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Staff Modal ── */}
      {showAdd && (
        <Modal title="Add Staff Member" onClose={closeAdd}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>

            {existingAccount ? (
              <>
                <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 9, padding: ".75rem", fontSize: ".85rem", color: "#0369a1", lineHeight: 1.5 }}>
                  An ELF account already exists for this email.
                </div>
                <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 9, padding: ".65rem .8rem" }}>
                  <div style={{ fontWeight: 700, fontSize: ".85rem", color: "#0b1e3d" }}>{existingAccount.name}</div>
                  <div style={{ fontSize: ".75rem", color: "#6b7280" }}>{existingAccount.email}</div>
                </div>
                <p style={{ margin: 0, fontSize: ".82rem", color: "#6b7280" }}>
                  Add their existing account to this team as {roleLabel(role)}. Their password will not change.
                </p>
                {formError && <p style={{ margin: 0, color: "#dc2626", fontSize: ".8rem" }}>{formError}</p>}
                <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
                  <button onClick={() => setExistingAccount(null)} style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
                    Back
                  </button>
                  <button onClick={handleAssignExisting} disabled={saving} style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
                    {saving ? "Adding…" : "Add Existing Account"}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Method selector */}
                <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
                  <button
                    type="button"
                    onClick={() => setMethod("invite")}
                    style={{
                      textAlign: "left", padding: ".7rem .85rem", borderRadius: 10,
                      border: method === "invite" ? "2px solid #0b1e3d" : "1.5px solid #e5e7eb",
                      background: method === "invite" ? "#f8f9fb" : "#fff", cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: ".85rem", color: "#0b1e3d" }}>
                      Send Invitation <span style={{ color: "#16a34a", fontSize: ".68rem", fontWeight: 700 }}>Recommended</span>
                    </div>
                    <div style={{ fontSize: ".76rem", color: "#6b7280", marginTop: ".15rem" }}>
                      We&rsquo;ll email them a secure link to create or connect their ELF account.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("temp_password")}
                    style={{
                      textAlign: "left", padding: ".7rem .85rem", borderRadius: 10,
                      border: method === "temp_password" ? "2px solid #0b1e3d" : "1.5px solid #e5e7eb",
                      background: method === "temp_password" ? "#f8f9fb" : "#fff", cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: ".85rem", color: "#0b1e3d" }}>
                      Create Account with Temporary Password
                    </div>
                    <div style={{ fontSize: ".76rem", color: "#6b7280", marginTop: ".15rem" }}>
                      Create access now and share the temporary password securely.
                    </div>
                  </button>
                </div>

                <label style={lbl}>
                  Full Name *
                  <input style={inp} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" autoFocus />
                </label>

                <label style={lbl}>
                  Email *
                  <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
                </label>

                <div style={lbl}>
                  Role *
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".35rem" }}>
                    {(["assistant_coach", "booster"] as const).map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        style={{
                          padding: ".45rem .25rem", borderRadius: 8,
                          border: role === r ? "2px solid #0b1e3d" : "2px solid #e5e7eb",
                          background: role === r ? "#f8f9fb" : "#fff",
                          color: role === r ? "#0b1e3d" : "#6b7280",
                          fontSize: ".72rem", fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        {roleLabel(r)}
                      </button>
                    ))}
                  </div>
                </div>

                {method === "temp_password" && (
                  <label style={lbl}>
                    Temporary Password *
                    <input style={inp} type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 8 characters" />
                  </label>
                )}

                {formError && <p style={{ margin: 0, color: "#dc2626", fontSize: ".8rem" }}>{formError}</p>}

                <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
                  <button onClick={closeAdd} style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={handleSubmit} disabled={saving} style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
                    {saving ? "Saving…" : method === "invite" ? "Send Invitation" : "Create Account"}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
