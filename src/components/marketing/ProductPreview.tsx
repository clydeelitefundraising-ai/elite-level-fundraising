import Image from "next/image";
import type { ReactNode } from "react";

interface RealImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

interface ProductPreviewProps {
  label: string;
  children?: ReactNode;
  /** A captured screenshot from the real product (demo data only). When set,
   * this replaces `children` and the chrome tag drops "illustrative" — the
   * screen itself is authentic, even though the data inside it is a demo
   * seed, not a real customer's. */
  image?: RealImage;
  /** Optional note shown under the label when the real screenshot's demo
   * data could otherwise read as a live customer result (e.g. dollar
   * totals). Omit when the screen is self-evidently a demo (e.g. an empty
   * "no announcements yet" state never appears, so no note needed there). */
  demoNote?: string;
}

// Shared "browser chrome" frame for every product screen on the marketing
// site — both illustrative mockups and real captured screenshots. The tag
// in the chrome bar tells them apart: "Illustrative" for hand-built mockups,
// a screen-specific label (e.g. "Coach dashboard") for real screenshots.
// Real screenshots always use demo/seed data, never a live customer's.
export function ProductPreview({ label, children, image, demoNote }: ProductPreviewProps) {
  return (
    <div className="mk-preview-frame" aria-hidden={image ? undefined : "true"}>
      <div className="mk-preview-chrome">
        <span className="mk-preview-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="mk-preview-tag">
          {image ? label : "Product preview — illustrative"}
        </span>
      </div>
      {image ? (
        <div className="mk-preview-image-body">
          <Image
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            sizes="(max-width: 760px) 100vw, 560px"
            style={{ width: "100%", height: "auto", display: "block" }}
          />
          {demoNote && <div className="mk-preview-demo-note">{demoNote}</div>}
        </div>
      ) : (
        <div className="mk-preview-body">
          <div className="mk-preview-label">{label}</div>
          {children}
        </div>
      )}
    </div>
  );
}
