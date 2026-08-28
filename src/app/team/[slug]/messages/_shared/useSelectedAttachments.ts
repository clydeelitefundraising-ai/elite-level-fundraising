"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { selectFilesForAttachment, canPreviewAsImage, type ClientAttachmentKind } from "./attachmentClient";

export type SelectedAttachmentStatus = "pending" | "uploading" | "uploaded" | "error";

export type SelectedAttachment = {
  localId: string;
  file: File;
  kind: ClientAttachmentKind;
  // Object URL for LOCAL preview only — never sent anywhere, never
  // confused with the real download URL. Only set for formats a browser
  // can reliably rasterize (see canPreviewAsImage) — HEIC/HEIF and every
  // non-image kind fall back to a plain icon instead.
  previewUrl: string | null;
  status: SelectedAttachmentStatus;
  error?: string;
  // Set once this exact file has been successfully signed + uploaded.
  // Retained across a failed Send (a sibling file failing must not throw
  // away this one's already-created attachment) so a retry can reuse it
  // instead of re-signing/re-uploading and orphaning a second pending
  // row for the same file. Scoped to the thread it was uploaded against
  // (uploadedForThreadId) so a resolve() that unexpectedly returns a
  // DIFFERENT thread on retry (the new-thread flow) never lets a stale
  // id leak into the wrong thread — see uploadMessageAttachments, which
  // only reuses this pair when uploadedForThreadId matches the thread
  // being sent to right now.
  attachmentId?: string;
  uploadedForThreadId?: string;
};

let localIdCounter = 0;
function makeLocalId(): string {
  localIdCounter += 1;
  return `local-attachment-${localIdCounter}`;
}

/** Owns the composer's in-progress attachment selection: adding files
 *  (validated + capped at the max), removing one, updating per-file
 *  upload status, and resetting after a send — with object-URL lifecycle
 *  handled correctly in every case (removed, reset after send, or the
 *  component unmounting with items still selected), so no blob URL is
 *  ever leaked. */
export function useSelectedAttachments() {
  const [selected, setSelected] = useState<SelectedAttachment[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  // Kept in sync via an effect, never mutated during render — refs must
  // only be read/written outside of render (event handlers, effects).
  const selectedRef = useRef<SelectedAttachment[]>(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const addFiles = useCallback((files: File[]) => {
    const { validFiles, errors } = selectFilesForAttachment(selectedRef.current.length, files);
    setSelectionError(errors[0] ?? null);
    if (!validFiles.length) return;
    setSelected(prev => [
      ...prev,
      ...validFiles.map(({ file, kind }) => ({
        localId: makeLocalId(),
        file,
        kind,
        previewUrl: canPreviewAsImage(file.type) ? URL.createObjectURL(file) : null,
        status: "pending" as const,
      })),
    ]);
  }, []);

  const removeFile = useCallback((localId: string) => {
    setSelected(prev => {
      const target = prev.find(a => a.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(a => a.localId !== localId);
    });
  }, []);

  const updateStatus = useCallback((
    localId: string,
    status: SelectedAttachmentStatus,
    error?: string,
    attachmentId?: string,
    uploadedForThreadId?: string,
  ) => {
    setSelected(prev => prev.map(a => (a.localId === localId
      ? { ...a, status, error, ...(attachmentId ? { attachmentId, uploadedForThreadId } : {}) }
      : a)));
  }, []);

  const reset = useCallback(() => {
    setSelected(prev => {
      prev.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
      return [];
    });
    setSelectionError(null);
  }, []);

  // Revoke every remaining object URL if the component unmounts with
  // items still selected (e.g. navigating away mid-composition).
  useEffect(() => {
    return () => {
      selectedRef.current.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
    };
  }, []);

  return { selected, selectionError, addFiles, removeFile, updateStatus, reset };
}
