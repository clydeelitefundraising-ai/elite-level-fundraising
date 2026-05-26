import { SkeletonBlock, SkeletonLine } from "../_components/Skeleton";

export default function ShopLoading() {
  return (
    <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <SkeletonLine width={80}  height={11} />
        <div style={{ marginTop: 6 }}>
          <SkeletonLine width={200} height={20} />
        </div>
      </div>

      {/* Featured banner */}
      <SkeletonBlock height={110} />

      {/* Pills */}
      <div style={{ display: "flex", gap: 8 }}>
        {[60, 50, 80, 70, 100].map((w, i) => (
          <SkeletonBlock key={i} height={32} radius={100} />
        ))}
      </div>

      {/* Product grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ background: "#FFFFFF", borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
            <SkeletonBlock height={130} radius={0} />
            <div style={{ padding: "11px 12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              <SkeletonLine width="40%" height={10} />
              <SkeletonLine width="70%" height={13} />
              <SkeletonLine width="90%" height={11} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <SkeletonLine width={36} height={15} />
                <SkeletonBlock height={28} radius={9} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
