// Single source of truth for "what year goes in a copyright line" — avoids
// the same class of bug as the stale "2025 Season" default: a hardcoded
// literal that's correct the day it's written and wrong every year after.
export function currentCopyrightYear(now: Date = new Date()): number {
  return now.getFullYear();
}
