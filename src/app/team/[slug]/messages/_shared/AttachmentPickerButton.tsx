"use client";

import { useRef } from "react";
import { ACCEPTED_FILE_INPUT_ACCEPT } from "./attachmentClient";

export default function AttachmentPickerButton({
  onFilesSelected,
  disabled,
}: {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILE_INPUT_ACCEPT}
        style={{ display: "none" }}
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFilesSelected(files);
          // Reset so selecting the exact same file again still fires onChange.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label="Attach photos, videos, or files"
        title="Attach photos, videos, or files"
        style={{
          background:   "#fff",
          border:       "1.5px solid #e5e7eb",
          borderRadius: 10,
          width:        40,
          height:       40,
          minWidth:     40,
          minHeight:    40,
          flexShrink:   0,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          fontSize:     "1.15rem",
          cursor:       disabled ? "default" : "pointer",
          opacity:      disabled ? .5 : 1,
        }}
      >
        <span aria-hidden="true">📎</span>
      </button>
    </>
  );
}
