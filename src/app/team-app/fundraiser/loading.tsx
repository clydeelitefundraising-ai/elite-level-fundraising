import { SkeletonBlock, SkeletonLine, SkeletonCircle } from "../_components/Skeleton";

export default function FundraiserLoading() {
  return (
    <div>
      {/* Sticky header skeleton */}
      <div style={{ padding: "10px 16px 12px", borderBottom: "1px solid #EDE9E3" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
          <SkeletonLine width="65%" height={12} />
          <SkeletonLine width={32} height={14} />
        </div>
        <SkeletonBlock height={4} radius={2} />
      </div>

      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
        <SkeletonBlock height={156} />

        <div style={{ display: "flex", gap: 10 }}>
          <SkeletonBlock height={72} radius={16} />
          <SkeletonBlock height={72} radius={16} />
          <SkeletonBlock height={72} radius={16} />
        </div>

        <SkeletonBlock height={76} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonLine width={130} height={11} />
          <div style={{ background: "#FFFFFF", borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.07)" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < 4 ? "1px solid #F5F1EC" : "none" }}>
                <SkeletonCircle size={22} />
                <SkeletonCircle size={38} />
                <div style={{ flex: 1 }}>
                  <SkeletonLine width="55%" height={13} />
                  <div style={{ marginTop: 6 }}>
                    <SkeletonBlock height={4} radius={2} />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  <SkeletonLine width={60} height={14} />
                  <SkeletonLine width={44} height={10} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <SkeletonBlock height={54} radius={18} />
      </div>
    </div>
  );
}
