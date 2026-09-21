"use client";

import { useState } from "react";
import type { CampaignSettings } from "@/lib/supabase";
import type { FollowUpRow, FollowUpSort, FollowUpFilter } from "@/lib/followUps";
import {
  sortFollowUpRows,
  filterFollowUpRows,
  buildFollowUpsReportTitle,
  buildFollowUpsCsv,
  buildFollowUpsCsvFilename,
  DEFAULT_FOLLOW_UP_SORT,
} from "@/lib/followUps";
import type { OutreachRow } from "@/lib/teamData";
import { shareFileOrFallback } from "../_components/nativeFileShare";
import { isAndroidNativeApp, androidErrorMessage } from "@/lib/androidFileBridge";

// D6: the row array, sort/filter state, and Update/History modal-open
// state previously owned directly inside FollowUpsView.tsx (verbatim
// logic, only relocated) — extracted into a hook so BOTH the existing
// mobile presentation (FollowUpsView.tsx, unmodified in behavior) and the
// new desktop workspace (DesktopFollowUpsView.tsx) can share ONE
// authoritative Follow-Ups workflow instead of two independent copies,
// exactly as D3/D4/D5's hooks did before it. No behavior change: every
// field/function name, request shape, and state transition is identical
// to what FollowUpsView.tsx did inline before D6. sortFollowUpRows/
// filterFollowUpRows/buildFollowUpsCsv/etc. (src/lib/followUps.ts) are
// reused completely unmodified — this hook only wires them to shared
// state, it never re-implements them.
export function useFollowUpsWorkspace(
  slug: string,
  settings: CampaignSettings,
  initialRows: FollowUpRow[],
) {
  const [rows,           setRows]           = useState<FollowUpRow[]>(initialRows);
  const [sort,           setSort]           = useState<FollowUpSort>(DEFAULT_FOLLOW_UP_SORT);
  const [filter,         setFilter]         = useState<FollowUpFilter>("all");
  const [updateAthlete,  setUpdateAthlete]  = useState<FollowUpRow | null>(null);
  const [historyAthlete, setHistoryAthlete] = useState<FollowUpRow | null>(null);

  // Print always consumes exactly this same sorted+filtered array — no
  // independent query, no re-sort — so it matches the coach's current
  // working view by construction, regardless of which presentation
  // (mobile or desktop) is currently CSS-visible.
  const sortedRows  = sortFollowUpRows(rows, sort);
  const visibleRows = filterFollowUpRows(sortedRows, filter);
  const reportTitle = buildFollowUpsReportTitle(filter, visibleRows.length, rows.length);

  const applyOutreachUpdate = (athleteId: string, status: OutreachRow["status"], note: string | null, createdAt: string) => {
    setRows(prev => prev.map(r =>
      r.id === athleteId ? { ...r, outreachStatus: status, outreachNote: note, outreachAt: createdAt } : r,
    ));
  };

  const openUpdate  = (r: FollowUpRow) => setUpdateAthlete(r);
  const closeUpdate = () => setUpdateAthlete(null);
  const openHistory  = (r: FollowUpRow) => setHistoryAthlete(r);
  const closeHistory = () => setHistoryAthlete(null);

  // Same visibleRows the on-screen list and Print render — exported file
  // always matches the coach's current sort/filter, never a separate query.
  // A raw <a download> click is a silent no-op inside the installed iOS
  // Capacitor app (WKWebView has no download-manager UI) — routed through
  // shareFileOrFallback so it opens the native Share/Save sheet there,
  // falling back to this exact anchor-click behavior on desktop/browser.
  const handleExport = () => {
    const csv = buildFollowUpsCsv(visibleRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const filename = buildFollowUpsCsvFilename(settings.school_name, settings.sport_name);
    const file = new File([blob], filename, { type: "text/csv;charset=utf-8" });
    const fallback = () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };
    void shareFileOrFallback(file, fallback).catch(err => {
      if (isAndroidNativeApp()) window.alert(androidErrorMessage(err));
      else throw err;
    });
  };

  const handlePrint = () => window.print();

  return {
    slug, settings,
    rows, sort, setSort, filter, setFilter,
    sortedRows, visibleRows, reportTitle,
    updateAthlete, historyAthlete, openUpdate, closeUpdate, openHistory, closeHistory,
    applyOutreachUpdate, handleExport, handlePrint,
  };
}

export type FollowUpsWorkspaceState = ReturnType<typeof useFollowUpsWorkspace>;
