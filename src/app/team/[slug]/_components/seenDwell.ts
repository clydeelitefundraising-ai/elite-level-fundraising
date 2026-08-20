// Phase 9: pure, framework-independent dwell/visibility logic for
// automatic announcement "Seen" tracking — no DOM, no React, no
// IntersectionObserver here, so this is directly node:test-able. The
// React/observer wiring lives in useSeenTracker.ts, which imports this.

export const SEEN_DWELL_MS = 1000;
export const SEEN_RATIO_THRESHOLD = 0.5;
export const SEEN_PIXEL_THRESHOLD = 200;

export type IntersectionSample = {
  intersectionRatio: number;
  visibleHeightPx: number;
};

/** Does this single intersection sample count as "visible enough to
 *  plausibly be noticed"? At least 50% of the card's area OR at least
 *  200px of its height visible — the pixel branch exists specifically so
 *  a card taller than the viewport (a long announcement on a small
 *  iPhone) isn't mathematically unable to ever reach 50%. */
export function qualifiesAsVisible(sample: IntersectionSample): boolean {
  return sample.intersectionRatio >= SEEN_RATIO_THRESHOLD || sample.visibleHeightPx >= SEEN_PIXEL_THRESHOLD;
}

/**
 * Drives the "continuously visible for SEEN_DWELL_MS" rule from a stream
 * of qualifies/doesn't-qualify updates (typically fed by an
 * IntersectionObserver callback via qualifiesAsVisible above). Fires
 * `onDwellComplete` at most once. Reset-not-pause: any drop below the
 * qualifying threshold before the full duration cancels the timer
 * outright — re-qualifying afterward starts a fresh SEEN_DWELL_MS window,
 * never resumes a partial one. A quick scroll-past (qualifies, then stops
 * qualifying well under dwellMs later) never fires.
 */
export function createDwellTracker(onDwellComplete: () => void, dwellMs: number = SEEN_DWELL_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;

  function clear() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  }

  function update(qualifies: boolean) {
    if (fired) return;
    if (qualifies) {
      // Already running — let it continue; redundant "still qualifies"
      // updates must never restart the window (that would let a card
      // stay perpetually "almost seen" if it happens to re-cross the
      // same intersection threshold before completing).
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          fired = true;
          onDwellComplete();
        }, dwellMs);
      }
    } else {
      clear();
    }
  }

  function dispose() {
    clear();
    fired = true; // prevents any late-firing timer callback after unmount
  }

  return { update, dispose };
}
