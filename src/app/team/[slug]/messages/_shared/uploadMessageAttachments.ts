import { parseSignResponse } from "./attachmentClient";

// Sequential, not parallel — deliberately. "If one upload fails, do not
// send the message... do not silently drop failed attachments and send
// the rest" is trivially guaranteed by stopping at the first failure
// before even starting the next file's upload, rather than needing to
// cancel in-flight requests for the remaining files. A small latency
// cost for the common (few small files) case, in exchange for much
// simpler, more obviously-correct failure semantics.

export type AttachmentUploadStatus = "uploading" | "uploaded" | "error";

async function uploadOneAttachment(
  slug: string,
  threadId: string,
  file: File,
): Promise<{ ok: true; attachmentId: string } | { ok: false; error: string }> {
  let signRes: Response;
  try {
    signRes = await fetch(`/api/team/${slug}/messages/threads/${threadId}/attachments/sign`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        original_filename: file.name,
        mime_type:         file.type,
        byte_size:         file.size,
      }),
    });
  } catch {
    return { ok: false, error: `Network error while preparing "${file.name}" for upload.` };
  }

  const signJson = await signRes.json().catch(() => null);
  const parsed = parseSignResponse(signJson);
  if (!signRes.ok || !parsed.ok) {
    return { ok: false, error: (!parsed.ok && parsed.error) || `Failed to prepare "${file.name}" for upload.` };
  }

  // PUT directly to the server-issued signed URL — an opaque upload
  // target, never inspected or reconstructed client-side. No apikey/
  // Authorization header: the token embedded in the URL's own query
  // string is what authorizes this PUT.
  //
  // Body/header shape matches the actual installed @supabase/storage-js
  // contract exactly (verified against node_modules/@supabase/storage-js
  // StorageFileApi.ts's own uploadToSignedUrl — team-files' /files/sign
  // route turned out to have NO client consumer anywhere in this app, so
  // it was never a proven precedent to copy from). For a File/Blob body,
  // the real client always sends multipart/form-data — the file appended
  // under an EMPTY field name, plus a cacheControl field — never a raw
  // binary body with a manually-set Content-Type. It also always sends
  // an `x-upsert` header. Sending the wrong body/header shape here was
  // the actual bug: a raw-binary PUT with an arbitrary Content-Type
  // value is not a CORS-simple request, and Supabase Storage's edge
  // likely doesn't allow it for this endpoint — that mismatch is what
  // surfaced to users as a generic browser "network error" (fetch
  // rejecting before any readable HTTP response), not a clean 4xx/5xx.
  const formData = new FormData();
  formData.append("cacheControl", "3600");
  formData.append("", file);

  let putRes: Response;
  try {
    putRes = await fetch(parsed.signedUploadUrl, {
      method:  "PUT",
      headers: { "x-upsert": "false" },
      body:    formData,
    });
  } catch {
    return { ok: false, error: `Network error while uploading "${file.name}".` };
  }
  if (!putRes.ok) {
    return { ok: false, error: `Failed to upload "${file.name}".` };
  }

  return { ok: true, attachmentId: parsed.attachmentId };
}

export type UploadMessageAttachmentsResult =
  | { ok: true; attachmentIds: string[] }
  | { ok: false; error: string; failedLocalId: string };

export type AttachmentUploadItem = {
  localId: string;
  file: File;
  // If this exact file was already successfully signed+uploaded in a
  // prior attempt (a retry after a SIBLING file failed), pass its
  // attachmentId/uploadedForThreadId back in — see the reuse check
  // below. Omit both for a file that has never successfully uploaded.
  attachmentId?: string;
  uploadedForThreadId?: string;
};

/** Uploads a batch of already-locally-validated files against a real,
 *  already-authorized thread, one at a time, stopping immediately on the
 *  first failure. Never sends storage_path, an attachment id, or any
 *  uploader identity from the client — the sign endpoint derives all of
 *  that server-side from the authenticated session and its own generated
 *  path. `onProgress` is optional UI feedback only, not used for control
 *  flow.
 *
 *  Retry safety: a file whose `attachmentId` was already recorded for
 *  THIS EXACT `threadId` is reused as-is — no re-sign, no re-upload, no
 *  second pending row created for the same file. If `uploadedForThreadId`
 *  doesn't match the `threadId` being sent to right now (the new-thread
 *  flow unexpectedly resolving a different thread on retry), the prior
 *  id is never reused — that file is uploaded fresh against the real
 *  current thread instead, and the old pending row is left for the
 *  existing 24h stale-pending sweep to eventually reclaim. */
export async function uploadMessageAttachments(
  slug: string,
  threadId: string,
  items: AttachmentUploadItem[],
  onProgress?: (localId: string, status: AttachmentUploadStatus, error?: string, attachmentId?: string) => void,
): Promise<UploadMessageAttachmentsResult> {
  const attachmentIds: string[] = [];

  for (const item of items) {
    if (item.attachmentId && item.uploadedForThreadId === threadId) {
      onProgress?.(item.localId, "uploaded", undefined, item.attachmentId);
      attachmentIds.push(item.attachmentId);
      continue;
    }

    onProgress?.(item.localId, "uploading");
    const result = await uploadOneAttachment(slug, threadId, item.file);
    if (!result.ok) {
      onProgress?.(item.localId, "error", result.error);
      return { ok: false, error: result.error, failedLocalId: item.localId };
    }
    onProgress?.(item.localId, "uploaded", undefined, result.attachmentId);
    attachmentIds.push(result.attachmentId);
  }

  return { ok: true, attachmentIds };
}
