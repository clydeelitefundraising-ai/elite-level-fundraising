import { SkeletonBlock, SkeletonLine, SkeletonCircle } from "../_components/Skeleton";

export default function HomeLoading() {
  return (
    <div>
      {/* Hero skeleton */}
      <SkeletonBlock height={230} radius={0} />

      <div style={{ padding: "16px 16px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Next game */}
        <SkeletonBlock height={78} />

        {/* Announcement */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonLine width={120} height={11} />
          <div
            style={{
              background: "#FFFFFF", borderRadius: 20, padding: 16,
              boxShadow: "0 2px 14px rgba(0,0,0,0.07)",
              display: "flex", gap: 14,
            }}
          >
            <SkeletonCircle size={40} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
              <SkeletonLine width="55%" height={13} />
              <SkeletonLine width="100%" height={11} />
              <SkeletonLine width="85%" height={11} />
              <SkeletonLine width="30%" height={10} />
            </div>
          </div>
        </div>

        {/* Progress */}
        <SkeletonBlock height={122} />

        {/* Spotlight */}
        <SkeletonBlock height={160} />

        {/* Sponsors */}
        <SkeletonBlock height={88} />

        {/* Next up */}
        <SkeletonBlock height={82} />
      </div>
    </div>
  );
}
