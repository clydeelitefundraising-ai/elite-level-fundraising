"use client";

import { labelStyle, inputStyle, fieldErrorStyle, fieldWrapperStyle } from "./formStyles";

const MAX_LENGTH = 200; // matches O2's own server-side MAX_FIELD cap

// Phase O3 — free text, deliberately. The O3 audit confirmed ELF has no
// canonical sport taxonomy anywhere today (not even the legacy admin
// wizard) — introducing one here would be inventing a first taxonomy as a
// side effect of this phase, not reusing one. Kept as its own component
// (mirroring SchoolField's isolation) purely for consistency, not because
// a future enhancement is currently planned for it.
export default function SportField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div style={fieldWrapperStyle}>
      <label htmlFor="team-onboarding-sport" style={labelStyle}>Sport</label>
      <input
        id="team-onboarding-sport"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Track & Field"
        maxLength={MAX_LENGTH}
        style={inputStyle}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "team-onboarding-sport-error" : undefined}
      />
      {error && (
        <p id="team-onboarding-sport-error" role="alert" style={fieldErrorStyle}>{error}</p>
      )}
    </div>
  );
}
