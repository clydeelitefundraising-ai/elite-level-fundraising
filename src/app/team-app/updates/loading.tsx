import { SkeletonBlock, SkeletonLine } from "../_components/Skeleton";

function CardSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "stretch",
      background: "#FFFFFF", borderRadius: 18,
      boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
      overflow: "hidden",
    }}>
      <div style={{ width: 4, background: "#ECE7DF", flexShrink: 0 }} />
      <div style={{ flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Author row */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <SkeletonBlock height={28} radius={50} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <SkeletonLine width={90} height={10} />
          </div>
          <SkeletonLine width={50} height={9} />
        </div>
        {/* Title */}
        <SkeletonLine width="75%" height={14} />
        {/* Body */}
        <SkeletonLine width="95%" height={11} />
        <SkeletonLine width="60%" height={11} />
        {/* Category badge */}
        <SkeletonBlock height={18} radius={5} />
        {/* Attachment (for tall card) */}
        {tall && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F9F7F4", borderRadius: 11, padding: "8px 10px", border: "1px solid #EDE9E3" }}>
            <SkeletonBlock height={34} radius={9} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <SkeletonLine width="70%" height={11} />
              <SkeletonLine width="40%" height={9} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UpdatesLoading() {
  return (
    <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SkeletonLine width={60}  height={10} />
          <SkeletonLine width={190} height={20} />
        </div>
        <SkeletonLine width={68} height={28} />
      </div>

      {/* Filter pills — SkeletonLine accepts width, giving rounded pill shape */}
      <div style={{ display: "flex", gap: 7 }}>
        {[36, 44, 76, 52, 66, 74].map((w, i) => (
          <SkeletonLine key={i} width={w} height={30} />
        ))}
      </div>

      {/* Pinned card */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SkeletonLine width={64} height={11} />
          <div style={{ flex: 1, height: 1, background: "#EDE9E3" }} />
        </div>
        <CardSkeleton tall />
      </div>

      {/* Feed group */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SkeletonLine width={44} height={11} />
          <div style={{ flex: 1, height: 1, background: "#EDE9E3" }} />
          <SkeletonLine width={24} height={20} />
        </div>
        <CardSkeleton />
        <CardSkeleton tall />
      </div>

      {/* Second group */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SkeletonLine width={70} height={11} />
          <div style={{ flex: 1, height: 1, background: "#EDE9E3" }} />
          <SkeletonLine width={24} height={20} />
        </div>
        <CardSkeleton />
      </div>

    </div>
  );
}
