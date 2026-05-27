"use client";

import { useState } from "react";
import { usePushSubscription } from "@/hooks/usePushSubscription";

export default function PushOptIn({ slug }: { slug: string }) {
  const { supported, subscribed, subscribe, unsubscribe } = usePushSubscription(slug);
  const [pending, setPending] = useState(false);

  if (!supported) return null;

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    if (subscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
    setPending(false);
  };

  return (
    <button
      onClick={handleClick}
      title={subscribed ? "Unsubscribe from team notifications" : "Subscribe to team notifications"}
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: subscribed ? "#0b1e3d" : "rgba(255,255,255,.12)",
        border: "none",
        cursor: pending ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1rem",
        flexShrink: 0,
        opacity: pending ? 0.6 : 1,
        transition: "background .18s ease, opacity .18s ease",
        position: "relative",
      }}
    >
      {subscribed ? "🔔" : "🔕"}
      {/* Dot indicator when not subscribed */}
      {!subscribed && (
        <span style={{
          position: "absolute",
          top: 5,
          right: 5,
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "#facc15",
          border: "1.5px solid #0b1e3d",
        }} />
      )}
    </button>
  );
}
