"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = (slug: string) => `elf_push_${slug}`;
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0))).buffer as ArrayBuffer;
}

export function usePushSubscription(slug: string) {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!supported) return;
    setSubscribed(localStorage.getItem(STORAGE_KEY(slug)) === "1");
  }, [slug, supported]);

  const subscribe = async (): Promise<void> => {
    if (!supported || !VAPID_PUBLIC_KEY) return;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON();
      await fetch(`/api/team/${slug}/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        }),
      });
      localStorage.setItem(STORAGE_KEY(slug), "1");
      setSubscribed(true);
    } catch {
      // User denied or browser error — fail silently
    }
  };

  const unsubscribe = async (): Promise<void> => {
    if (!supported) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/team/${slug}/push/unsubscribe`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      localStorage.removeItem(STORAGE_KEY(slug));
      setSubscribed(false);
    } catch {
      // Fail silently
    }
  };

  return { supported, subscribed, subscribe, unsubscribe };
}
