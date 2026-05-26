import { SkeletonBlock, SkeletonLine, SkeletonCircle } from "../_components/Skeleton";

export default function RosterLoading() {
  return (
    <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SkeletonLine width={60}  height={11} />
          <SkeletonLine width={200} height={20} />
          <SkeletonLine width={130} height={12} />
        </div>
        <SkeletonBlock height={32} radius={100} />
      </div>

      {/* Search bar */}
      <SkeletonBlock height={44} radius={14} />

      {/* Pills */}
      <div style={{ display: "flex", gap: 7 }}>
        {[50, 70, 80, 80, 70, 110, 80].map((_, i) => (
          <SkeletonBlock key={i} height={32} radius={100} />
        ))}
      </div>

      {/* List */}
      <div style={{ background: "#FFFFFF", borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.07)" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < 7 ? "1px solid #F5F1EC" : "none" }}>
            <SkeletonCircle size={44} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <SkeletonLine width="50%" height={14} />
              <div style={{ display: "flex", gap: 6 }}>
                <SkeletonBlock height={20} radius={5} />
                <SkeletonLine width={70} height={12} />
                <SkeletonLine width={24} height={11} />
              </div>
            </div>
            <SkeletonBlock height={32} radius={10} />
          </div>
        ))}
      </div>
    </div>
  );
}
