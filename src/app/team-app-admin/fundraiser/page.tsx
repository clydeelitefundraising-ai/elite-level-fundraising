"use client";

import { useState } from "react";
import { useAppStore } from "../../_store/AppStore";

type SaveState = "idle" | "saving" | "saved";

function useSave(): [SaveState, () => void] {
  const [s, set] = useState<SaveState>("idle");
  return [s, () => { set("saving"); setTimeout(() => { set("saved"); setTimeout(() => set("idle"), 2200); }, 700); }];
}

function SaveBtn({ state, onClick }: { state: SaveState; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: "9px 22px", borderRadius: 9, border: "none", cursor: "pointer", background: state === "saved" ? "#166534" : "#0B1E3D", color: "#FFFFFF", fontSize: 13, fontWeight: 700, transition: "background 0.2s" }}>
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Save Changes"}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>{children}</p>;
}

export default function AdminFundraiserPage() {
  const { fundraisingData: campaign, setFundraisingData } = useAppStore();
  const [active, setActive] = useState(true);
  const [mainSave, triggerMain] = useSave();

  const pct = Math.round((campaign.raised / campaign.goal) * 100);

  return (
    <div className="ta-adm-page">
      <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid #E8E4DC", background: "#FFFFFF" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0A0A0A" }}>Fundraiser</h1>
        <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>Configure the active fundraising campaign shown in the app.</p>
      </div>

      <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Campaign status card */}
        <div className="ta-adm-card" style={{ padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A" }}>Campaign Status</p>
            <p style={{ fontSize: 12, color: active ? "#166534" : "#9CA3AF", marginTop: 3, fontWeight: 600 }}>
              {active ? "🟢 Active — visible to athletes & parents" : "⏸ Paused — hidden from app"}
            </p>
          </div>
          <label className="ta-adm-toggle">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            <span className="ta-adm-toggle-track" />
          </label>
        </div>

        {/* Progress overview */}
        <div className="ta-adm-card" style={{ padding: "22px 24px" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A", marginBottom: 14 }}>Live Progress</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 18 }}>
            {[
              { label: "Raised",       value: `$${campaign.raised.toLocaleString()}` },
              { label: "Goal",         value: `$${campaign.goal.toLocaleString()}` },
              { label: "Donors",       value: campaign.donors },
              { label: "Avg Donation", value: `$${campaign.avgDonation}` },
            ].map(s => (
              <div key={s.label} style={{ background: "#F9F8F6", borderRadius: 12, padding: "14px 16px" }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: "#0A0A0A" }}>{s.value}</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, marginTop: 3 }}>{s.label}</p>
              </div>
            ))}
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <p style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>Progress toward goal</p>
              <p style={{ fontSize: 12, fontWeight: 800, color: "#C9A84C" }}>{pct}%</p>
            </div>
            <div style={{ height: 10, borderRadius: 10, background: "#EDE9E3", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: "linear-gradient(90deg, #C9A84C, #E0AA35)", borderRadius: 10 }} />
            </div>
            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
              Read-only — updated automatically from donations. TODO: connect Supabase.
            </p>
          </div>
        </div>

        {/* Campaign settings */}
        <div className="ta-adm-card" style={{ padding: "22px 24px" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#0A0A0A", marginBottom: 20 }}>Campaign Settings</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <Label>Campaign Name</Label>
              <input className="ta-adm-input" value={campaign.campaignName} onChange={e => setFundraisingData({ campaignName: e.target.value })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <div>
                <Label>Fundraising Goal ($)</Label>
                <input className="ta-adm-input" type="number" value={campaign.goal} onChange={e => setFundraisingData({ goal: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Days Remaining</Label>
                <input className="ta-adm-input" type="number" value={campaign.daysLeft} onChange={e => setFundraisingData({ daysLeft: Number(e.target.value) })} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "#FEF3C7", border: "1.5px solid #FDE68A" }}>
            <p style={{ fontSize: 12, color: "#92400E", fontWeight: 600 }}>
              ⚠️ These settings are for preview only. Connect Supabase to persist changes.
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <SaveBtn state={mainSave} onClick={triggerMain} />
          </div>
        </div>

      </div>
    </div>
  );
}
