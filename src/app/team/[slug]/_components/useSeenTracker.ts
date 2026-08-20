"use client";

import { useEffect } from "react";
import { createDwellTracker, qualifiesAsVisible } from "./seenDwell";
import { seenWriteState } from "./seenWriteState";

// Phase 9: automatic "Seen" marking — no scroll listeners, no polling,
// purely event-driven off IntersectionObserver's native callback. Fires
// at most once per (announcement, mounted-card) pair; the module-level
// seenWriteState additionally dedupes across every mounted card and
// across navigation between Home and Communications in the same session.
//
// The user must never have to tap/click anything for this to fire — it
// is strictly additional to (not a replacement for) the existing
// tap-to-read / mark-all-read paths on the separate notifications page,
// which remain untouched and still work via the same underlying
// idempotent DB upsert.
export function useSeenTracker(ref: React.RefObject<HTMLElement | null>, campaignSlug: string, announcementId: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (seenWriteState.isAlreadyHandled(announcementId)) return;

    const dwell = createDwellTracker(() => {
      void seenWriteState.attemptMarkSeen(announcementId, async id => {
        try {
          const res = await fetch(`/api/team/${campaignSlug}/announcements/${id}/seen`, { method: "POST" });
          return res.ok;
        } catch {
          return false;
        }
      });
    });

    // Multiple thresholds so the callback fires as the intersection ratio
    // crosses 0.5 in either direction (not just at fully-in/fully-out),
    // and gives the 200px pixel-fallback branch more chances to be
    // re-evaluated against intersectionRect as a tall card scrolls.
    const THRESHOLDS = Array.from({ length: 11 }, (_, i) => i / 10);
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          dwell.update(
            qualifiesAsVisible({
              intersectionRatio: entry.intersectionRatio,
              visibleHeightPx: entry.intersectionRect.height,
            }),
          );
        }
      },
      { threshold: THRESHOLDS },
    );
    observer.observe(el);

    return () => {
      dwell.dispose();
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref is a stable RefObject, not reactive state
  }, [campaignSlug, announcementId]);
}
