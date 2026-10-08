"use client";

import { labelStyle, inputStyle, fieldErrorStyle, fieldWrapperStyle } from "./formStyles";
import { buildSeasonOptions } from "./seasonOptions";

// Phase O3 — native <select>, never free text, so the value this component
// hands back is always one of a known-valid four-digit year string, making
// it structurally impossible for a coach to ever hit O2's
// validateSelfServiceSeason() rejection path (ambiguous formats like "Fall
// 2026" simply can't be entered here). O2's own [2000, 2099] backend
// validation is untouched and still runs — this is a UX improvement on top
// of it, not a replacement for it.
export default function SeasonField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const options = buildSeasonOptions(new Date().getFullYear());

  return (
    <div style={fieldWrapperStyle}>
      <label htmlFor="team-onboarding-season" style={labelStyle}>Season</label>
      <select
        id="team-onboarding-season"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, cursor: "pointer" }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "team-onboarding-season-error" : undefined}
      >
        {options.map(year => (
          <option key={year} value={year}>{year}</option>
        ))}
      </select>
      {error && (
        <p id="team-onboarding-season-error" role="alert" style={fieldErrorStyle}>{error}</p>
      )}
    </div>
  );
}
