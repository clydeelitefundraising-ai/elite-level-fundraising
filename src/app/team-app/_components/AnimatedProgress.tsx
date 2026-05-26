"use client";

import { useEffect, useState } from "react";

interface Props {
  pct: number;
  height?: number;
  gradient?: string;
  trackColor?: string;
  rounded?: boolean;
}

// Animates the progress bar from 0 → pct on first render.
export default function AnimatedProgress({
  pct,
  height = 10,
  gradient = "linear-gradient(90deg, #C9A84C, #F0C040)",
  trackColor = "rgba(255,255,255,0.12)",
  rounded = true,
}: Props) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 180);
    return () => clearTimeout(t);
  }, [pct]);

  const r = rounded ? height : 0;

  return (
    <div
      style={{
        height,
        borderRadius: r,
        background: trackColor,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: gradient,
          borderRadius: r,
          transition: "width 1.4s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </div>
  );
}
