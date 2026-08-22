// Season is an optional field throughout the onboarding wizard and every
// downstream consumer already treats a missing value gracefully (TeamHeader
// falls back to "", the New Campaign wizard preview falls back to generic
// "Season") — so the product model clearly treats it as optional, not
// required. The one place that didn't handle "missing" gracefully was the
// public campaign page's client-side initial state, which used the literal
// "2025 Season" — a live, brand-new 2026 campaign that left Season blank
// would show that stale year forever (React state that's simply never
// overwritten, since the fetch only assigns when the real value is a
// non-empty string). This is the single, tested source of truth for "what
// do we show when nobody ever set a season" — always the actual current
// year, never a hardcoded one.
export function defaultSeasonLabel(now: Date = new Date()): string {
  return `${now.getFullYear()} Season`;
}
