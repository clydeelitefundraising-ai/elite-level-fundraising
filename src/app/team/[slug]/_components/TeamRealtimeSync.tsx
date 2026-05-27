"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export default function TeamRealtimeSync({ slug }: { slug: string }) {
  const router = useRouter();

  useEffect(() => {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const channel = client
      .channel(`team:${slug}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements", filter: `campaign_slug=eq.${slug}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_events", filter: `campaign_slug=eq.${slug}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => { void client.removeChannel(channel); };
  }, [slug, router]);

  return null;
}
