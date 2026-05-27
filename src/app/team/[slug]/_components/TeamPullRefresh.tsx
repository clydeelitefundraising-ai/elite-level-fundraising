"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const THRESHOLD = 64;

export default function TeamPullRefresh() {
  const router      = useRouter();
  const startY      = useRef(0);
  const pullYRef    = useRef(0);
  const active      = useRef(false);
  const [pullY,     setPullY]     = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 4) return;
      startY.current = e.touches[0].clientY;
      active.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active.current || window.scrollY > 4) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        const clamped = Math.min(delta * 0.42, THRESHOLD + 12);
        pullYRef.current = clamped;
        setPullY(clamped);
      }
    };

    const onTouchEnd = async () => {
      if (!active.current) return;
      active.current = false;
      const captured = pullYRef.current;
      pullYRef.current = 0;
      setPullY(0);
      if (captured >= THRESHOLD * 0.88) {
        setRefreshing(true);
        router.refresh();
        await new Promise(r => setTimeout(r, 900));
        setRefreshing(false);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove",  onTouchMove,  { passive: true });
    document.addEventListener("touchend",   onTouchEnd,   { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove",  onTouchMove);
      document.removeEventListener("touchend",   onTouchEnd);
    };
  }, [router]);

  const visible = pullY > 16 || refreshing;
  const progress = Math.min(pullY / THRESHOLD, 1);

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: "min(430px, 100%)",
      display: "flex",
      justifyContent: "center",
      paddingTop: 100,
      zIndex: 80,
      pointerEvents: "none",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: ".45rem",
        padding: ".35rem .75rem .35rem .5rem",
        background: "#fff",
        borderRadius: 100,
        boxShadow: "0 3px 16px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06)",
        fontSize: ".72rem",
        fontWeight: 600,
        color: "#374151",
        animation: "elf-ptrPop .18s ease both",
        backdropFilter: "blur(8px)",
      }}>
        <div style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: "2.5px solid #e5e7eb",
          borderTopColor: "#0b1e3d",
          animation: refreshing ? "elf-spin .65s linear infinite" : undefined,
          transform: refreshing ? undefined : `rotate(${progress * 300}deg)`,
          flexShrink: 0,
        }} />
        {refreshing ? "Refreshing…" : progress >= 0.88 ? "Release to refresh" : "Pull to refresh"}
      </div>
    </div>
  );
}
