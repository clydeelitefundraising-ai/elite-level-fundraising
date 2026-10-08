"use client";

import { labelStyle, inputStyle, fieldErrorStyle, fieldWrapperStyle } from "./formStyles";

const MAX_LENGTH = 200; // matches O2's own server-side MAX_FIELD cap

// Phase O3 — deliberately isolated as its own component (not inlined into
// CreateTeamView) so Phase O4 can later replace/extend what's INSIDE this
// component (a school-search/organization-match/existing-team-discovery
// UI) without touching CreateTeamView's stage/review/submission logic at
// all. The contract this component exposes (`value: string`,
// `onChange(value: string)`) is exactly O2's own `schoolName: string`
// submission shape — O4 can change how this component fills that string
// in, never what shape it hands back.
export default function SchoolField({
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
      <label htmlFor="team-onboarding-school" style={labelStyle}>School</label>
      <input
        id="team-onboarding-school"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Monroe Valley High School"
        maxLength={MAX_LENGTH}
        autoComplete="organization"
        style={inputStyle}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "team-onboarding-school-error" : undefined}
      />
      {error && (
        <p id="team-onboarding-school-error" role="alert" style={fieldErrorStyle}>{error}</p>
      )}
    </div>
  );
}
