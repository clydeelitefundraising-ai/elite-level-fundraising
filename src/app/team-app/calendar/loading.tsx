import { SkeletonBlock, SkeletonLine } from "../_components/Skeleton";

export default function CalendarLoading() {
  return (
    <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SkeletonLine width={70}  height={11} />
        <SkeletonLine width={210} height={20} />
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[80, 90, 100, 100].map((_, i) => <SkeletonBlock key={i} height={28} radius={100} />)}
      </div>

      {/* Month group */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SkeletonLine width={50} height={13} />
          <div style={{ flex: 1, height: 1, background: "#EDE9E3" }} />
          <SkeletonBlock height={22} radius={100} />
        </div>

        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "stretch",
              background: "#FFFFFF", borderRadius: 18,
              boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
              overflow: "hidden",
            }}
          >
            <div style={{ width: 4, background: "#ECE7DF" }} />
            <SkeletonBlock height={60} radius={0} />
            <div style={{ flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <SkeletonLine width="55%" height={14} />
                <SkeletonBlock height={20} radius={5} />
              </div>
              <div style={{ display: "flex", gap: 14 }}>
                <SkeletonLine width={60} height={11} />
                <SkeletonLine width={90} height={11} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
