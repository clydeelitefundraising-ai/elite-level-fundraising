// Shared loading fallback for every page under /team/[slug]. Next.js wraps
// each child page in a Suspense boundary using this file, so it appears
// during tab-to-tab navigation instead of a blank flash. Intentionally
// generic (no page-specific copy or fake data) since it covers every tab.

function SkeletonBlock({ height = 84 }: { height?: number }) {
  return (
    <div
      style={{
        height,
        borderRadius: 13,
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        animation: "elf-pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

export default function TeamLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: ".75rem" }}
    >
      <SkeletonBlock height={64} />
      <SkeletonBlock height={140} />
      <SkeletonBlock height={140} />
      <SkeletonBlock height={100} />
    </div>
  );
}
