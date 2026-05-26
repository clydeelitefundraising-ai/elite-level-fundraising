// Reusable skeleton loading primitives for the Team App Portal.
// All apply the .ta-skeleton shimmer class defined in team-app.css.

export function SkeletonLine({
  width = "100%",
  height = 14,
}: {
  width?: string | number;
  height?: number;
}) {
  return (
    <div
      className="ta-skeleton"
      style={{ width, height, borderRadius: height }}
    />
  );
}

export function SkeletonCircle({ size = 44 }: { size?: number }) {
  return (
    <div
      className="ta-skeleton"
      style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0 }}
    />
  );
}

export function SkeletonBlock({
  height = 80,
  radius = 20,
}: {
  height?: number;
  radius?: number;
}) {
  return (
    <div
      className="ta-skeleton"
      style={{ height, borderRadius: radius }}
    />
  );
}

// A complete skeleton card with inner lines
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "#FFFFFF",
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <SkeletonCircle size={44} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <SkeletonLine width="60%" height={13} />
          <SkeletonLine width="40%" height={10} />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ marginBottom: i < lines - 1 ? 6 : 0 }}>
          <SkeletonLine width={i === lines - 1 ? "75%" : "100%"} height={11} />
        </div>
      ))}
    </div>
  );
}
