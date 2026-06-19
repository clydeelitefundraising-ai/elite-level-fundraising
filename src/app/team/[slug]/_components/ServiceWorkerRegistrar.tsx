"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure is non-fatal — push opt-in will surface the
        // error to the user if they attempt to subscribe.
      });
    }
  }, []);

  return null;
}
