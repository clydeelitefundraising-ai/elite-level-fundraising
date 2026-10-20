"use client";

import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import styles from "./Team.module.css";

// Team Management Phase 5-5 — the roster header's secondary action, next
// to Add Athlete (which stays the primary, filled action). Rendered only
// when the server gave an href (takeAttendance.ts). A plain link: opening
// the attendance screen reads today's attendance and writes nothing.
export default function TakeAttendanceLink({ href, size = "sm" }: { href: string; size?: "sm" | "md" }) {
  return (
    <Link href={href} className={`${styles.takeAttendance} ${size === "md" ? styles.takeAttendanceMd : ""} elf-focus-ring`}>
      <CalendarCheck size={size === "md" ? 16 : 15} aria-hidden="true" />
      Take Attendance
    </Link>
  );
}
