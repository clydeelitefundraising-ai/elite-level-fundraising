"use client";

import { useEffect, useRef } from "react";
import { gradeTabIndexForKey, type GradeTab, type GradeTabKey } from "./rosterHelpers";
import styles from "./Team.module.css";

// Roster grade tabs — "All Athletes" + one tab per represented grade (see
// rosterHelpers.ts's buildGradeTabs). Presentation only: the caller owns
// the selected key and filters its own list, so the mobile roster list and
// the desktop roster table (and, later, attendance) share one tab row.
//
// WAI-ARIA tabs pattern: role=tablist/tab, aria-selected, roving tabindex,
// ←/→/Home/End move between tabs. The row scrolls horizontally on narrow
// screens instead of squeezing (Team.module.css .gradeTabs), and the
// selected tab is scrolled into view when it changes.

export function gradeTabId(idPrefix: string, key: GradeTabKey): string {
  return `${idPrefix}-tab-${key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

export function gradeTabPanelId(idPrefix: string): string {
  return `${idPrefix}-panel`;
}

export default function GradeTabs({
  tabs,
  value,
  onChange,
  idPrefix,
  label = "Filter roster by grade",
}: {
  tabs: GradeTab[];
  value: GradeTabKey;
  onChange: (key: GradeTabKey) => void;
  idPrefix: string;
  label?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(0, tabs.findIndex(t => t.key === value));

  // Keep the selected tab visible by scrolling the tab row only —
  // horizontal, never the page (scrollIntoView could also scroll the page
  // vertically). The row is position:relative, so offsetLeft is row-relative.
  useEffect(() => {
    const list = listRef.current;
    const tab = tabRefs.current[selectedIndex];
    if (!list || !tab) return;
    const start = tab.offsetLeft;
    const end = start + tab.offsetWidth;
    if (start < list.scrollLeft) list.scrollLeft = Math.max(0, start - 8);
    else if (end > list.scrollLeft + list.clientWidth) list.scrollLeft = end - list.clientWidth + 8;
  }, [selectedIndex]);

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = gradeTabIndexForKey(e.key, index, tabs.length);
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].key);
    tabRefs.current[next]?.focus();
  }

  return (
    <div ref={listRef} role="tablist" aria-label={label} className={styles.gradeTabs}>
      {tabs.map((tab, i) => {
        const selected = i === selectedIndex;
        return (
          <button
            key={tab.key}
            ref={el => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            id={gradeTabId(idPrefix, tab.key)}
            aria-selected={selected}
            aria-controls={gradeTabPanelId(idPrefix)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={e => onKeyDown(e, i)}
            className={`${styles.gradeTab} elf-focus-ring`}
          >
            <span>{tab.label}</span>
            <span className={styles.gradeTabCount}>{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
}
