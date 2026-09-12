"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { staffRoleLabel } from "@/lib/permissions";

type StaffRow = { id: string; name: string; role: string };
type CoachFundraiserRow = { coach_id: string; active: boolean; goal_cents: number | null };

type Props = {
  slug: string;
  initialAllowCoachFundraising: boolean;
};

// Head-Coach-facing counterpart to AdminClient.tsx's "Coach Fundraising
// Participants" section — same visual/interaction shape (checkbox +
// goal-dollar input per coach, boosters disabled + "Not eligible"), but
// reads/writes through the Team-App-scoped, Head-Coach-gated routes
// (/api/team/[slug]/settings/coach-fundraising,
// /api/team/[slug]/coach-fundraisers) instead of the elf_admin-gated
// platform-admin routes — both ultimately call the SAME shared lib
// (src/lib/platform/coachFundraising.ts), so there is only ever one
// source of truth for participation/eligibility. Mirrors
// TeamBrandingSection.tsx's structure/style tokens exactly.
export default function CoachFundraisingSection({ slug, initialAllowCoachFundraising }: Props) {
  const router = useRouter();

  const [allowCoachFundraising, setAllowCoachFundraising] = useState(initialAllowCoachFundraising);
  const [toggleWorking, setToggleWorking] = useState(false);
  const [toggleError, setToggleError] = useState("");

  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [fundraisers, setFundraisers] = useState<CoachFundraiserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [savingCoachId, setSavingCoachId] = useState<string | null>(null);

  // Coaches only — booster staff rows are still shown (disabled, "Not
  // eligible") so the Head Coach sees the full roster and understands why
  // a name is unselectable, rather than it silently being absent.
  const loadParticipants = async () => {
    setLoading(true);
    setListError("");
    try {
      const [staffRes, fundraisersRes] = await Promise.all([
        fetch(`/api/team/${slug}/staff`),
        fetch(`/api/team/${slug}/coach-fundraisers`),
      ]);
      const staffData = await staffRes.json();
      const fundraisersData = await fundraisersRes.json();
      if (!staffRes.ok) { setListError(staffData.error ?? "Failed to load team staff."); return; }
      if (!fundraisersRes.ok) { setListError(fundraisersData.error ?? "Failed to load coach fundraising participants."); return; }
      setStaff(Array.isArray(staffData.staff) ? staffData.staff : []);
      setFundraisers(Array.isArray(fundraisersData) ? fundraisersData : []);
    } catch {
      setListError("Failed to load coach fundraising participants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowCoachFundraising && staff === null) {
      loadParticipants();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when first turned on, matches TeamBrandingSection's fetch-on-mount style elsewhere in this app
  }, [allowCoachFundraising]);

  const handleToggle = async (next: boolean) => {
    setToggleError("");
    setToggleWorking(true);
    try {
      const res = await fetch(`/api/team/${slug}/settings/coach-fundraising`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allow_coach_fundraising: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToggleError(data.error ?? "Failed to save coach fundraising setting.");
        return;
      }
      setAllowCoachFundraising(next);
      router.refresh();
    } catch {
      setToggleError("Failed to save coach fundraising setting.");
    } finally {
      setToggleWorking(false);
    }
  };

  const toggleParticipant = async (coachId: string, active: boolean, goalCents: number | null) => {
    setSavingCoachId(coachId);
    try {
      const res = await fetch(`/api/team/${slug}/coach-fundraisers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coach_id: coachId, active, goal_cents: goalCents }),
      });
      const data = await res.json();
      if (!res.ok) {
        setListError(data.error ?? "Failed to save coach fundraising participant.");
        return;
      }
      setFundraisers(prev => {
        const others = prev.filter(f => f.coach_id !== coachId);
        return [...others, { coach_id: coachId, active: data.active, goal_cents: data.goal_cents ?? null }];
      });
    } catch {
      setListError("Failed to save coach fundraising participant.");
    } finally {
      setSavingCoachId(null);
    }
  };

  return (
    <div style={{
      background: "var(--surface-light)",
      borderRadius: "var(--radius-lg)",
      padding: "1rem",
      border: "1px solid var(--border-app)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: allowCoachFundraising ? "1rem" : 0 }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 .3rem", fontSize: ".82rem", fontWeight: 700, color: "var(--text-primary-app)" }}>
            Allow coaches to participate in fundraising
          </p>
          <p style={{ margin: 0, fontSize: ".78rem", color: "var(--text-secondary-app)", lineHeight: 1.5 }}>
            Coaches you select can compete on the leaderboard, share their own fundraiser link, and manage their own fundraising contacts. Boosters are never eligible.
          </p>
        </div>
        <button
          onClick={() => handleToggle(!allowCoachFundraising)}
          disabled={toggleWorking}
          role="switch"
          aria-checked={allowCoachFundraising}
          style={{
            flexShrink: 0,
            width: 44, height: 26, borderRadius: 100, border: "none",
            background: allowCoachFundraising ? "var(--team-primary)" : "var(--border-app)",
            position: "relative",
            cursor: toggleWorking ? "not-allowed" : "pointer",
            padding: 0,
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: allowCoachFundraising ? 21 : 3,
            width: 20, height: 20, borderRadius: "50%", background: "#fff",
            transition: "left .15s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,.25)",
          }} />
        </button>
      </div>

      {toggleError && (
        <p style={{ margin: ".65rem 0 0", padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "var(--color-error)", fontSize: ".78rem" }}>
          {toggleError}
        </p>
      )}

      {allowCoachFundraising && (
        <div>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: ".6rem" }}>
            Participating Coaches
          </div>

          {listError && (
            <p style={{ margin: "0 0 .65rem", padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "var(--color-error)", fontSize: ".78rem" }}>
              {listError}
            </p>
          )}

          {loading || staff === null ? (
            <p style={{ margin: 0, fontSize: ".82rem", color: "var(--text-muted-app)" }}>Loading…</p>
          ) : staff.length === 0 ? (
            <p style={{ margin: 0, fontSize: ".82rem", color: "var(--text-muted-app)" }}>No coaches on this team yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
              {staff.filter(s => s.role !== "booster" && (s.role === "head_coach" || s.role === "assistant_coach")).length === 0 && staff.length > 0 && (
                <p style={{ margin: 0, fontSize: ".8rem", color: "var(--text-muted-app)" }}>No eligible coaches on this team yet.</p>
              )}
              {staff.map(s => {
                const eligible = s.role === "head_coach" || s.role === "assistant_coach";
                const participant = fundraisers.find(f => f.coach_id === s.id);
                const active = eligible && (participant?.active ?? false);
                const goalDollars = participant?.goal_cents != null ? String(Math.round(participant.goal_cents / 100)) : "";
                const savingThis = savingCoachId === s.id;
                return (
                  <div key={s.id} style={{
                    display: "flex", alignItems: "center", gap: ".75rem",
                    padding: ".65rem .85rem", borderRadius: 9,
                    background: eligible ? "var(--surface-light-elevated)" : "var(--surface-light)",
                    border: "1px solid var(--border-app)",
                    opacity: savingThis ? .7 : 1,
                  }}>
                    <input
                      type="checkbox"
                      checked={active}
                      disabled={!eligible || savingThis}
                      onChange={e => toggleParticipant(s.id, e.target.checked, participant?.goal_cents ?? null)}
                      style={{ width: 16, height: 16, cursor: eligible ? "pointer" : "not-allowed", accentColor: "var(--team-primary)", flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: ".86rem", color: eligible ? "var(--text-primary-app)" : "var(--text-muted-app)" }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: ".72rem", color: "var(--text-muted-app)" }}>
                        {staffRoleLabel(s.role)}
                        {!eligible && " · Not eligible"}
                      </div>
                    </div>
                    {eligible && active && (
                      <label style={{ display: "flex", alignItems: "center", gap: ".3rem", fontSize: ".78rem", color: "var(--text-secondary-app)", flexShrink: 0 }}>
                        Goal: $
                        <input
                          type="number"
                          min="0"
                          disabled={savingThis}
                          defaultValue={goalDollars}
                          onBlur={e => {
                            // Explicit blur (in addition to the natural one
                            // already firing this handler) — this input
                            // isn't inside a <Modal> like the app's other
                            // 16px-input fixes, so there's no modal-unmount
                            // moment to release focus; calling it directly
                            // here is what lets iOS drop its auto-zoom once
                            // the value is committed.
                            const input = e.target;
                            const dollars = parseFloat(input.value);
                            const cents = Number.isFinite(dollars) && dollars >= 0 ? Math.round(dollars * 100) : null;
                            toggleParticipant(s.id, true, cents);
                            input.blur();
                          }}
                          style={{
                            width: 80, padding: ".35rem .5rem",
                            border: "1.5px solid var(--border-app)", borderRadius: 7,
                            fontSize: "1rem", color: "var(--text-primary-app)",
                          }}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
