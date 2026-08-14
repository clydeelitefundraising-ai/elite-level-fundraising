"use client";

import type { CalendarEventRow } from "@/lib/teamData";
import {
  eventTypeStyle,
  EVENT_TYPE_LABELS,
  formatFullDate,
  displayEventTime,
  directionsUrl,
} from "@/lib/calendarShared";
import Modal from "./Modal";

const lbl: React.CSSProperties = {
  fontSize: ".62rem",
  fontWeight: 700,
  color: "#9ca3af",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  marginBottom: ".2rem",
};

// Phase 4A: single event-details experience shared by the Calendar page
// and Home's Upcoming section — reused, not reimplemented, in both
// places, so they can never disagree about what an event's details are.
export default function EventDetailsModal({
  ev,
  canManage,
  onClose,
  onEdit,
  onDelete,
}: {
  ev: CalendarEventRow;
  canManage: boolean;
  onClose: () => void;
  onEdit?: (ev: CalendarEventRow) => void;
  onDelete?: (id: string) => void;
}) {
  const s = eventTypeStyle(ev.type);
  const time = displayEventTime(ev);

  return (
    <Modal
      title="Event Details"
      onClose={onClose}
      footer={canManage ? (
        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
          <button
            onClick={() => onDelete?.(ev.id)}
            style={{ padding: ".5rem 1rem", background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}
          >
            Delete
          </button>
          <button
            onClick={() => onEdit?.(ev)}
            style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}
          >
            Edit Event
          </button>
        </div>
      ) : undefined}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
        <div>
          <span style={{
            display: "inline-block", padding: ".14rem .55rem", borderRadius: 100,
            fontSize: ".62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em",
            background: s.bg, color: s.color, marginBottom: ".45rem",
          }}>
            {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
          </span>
          <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#0b1e3d", lineHeight: 1.25 }}>
            {ev.title}
          </h3>
        </div>

        <div>
          <div style={lbl}>When</div>
          <div style={{ fontSize: ".9rem", fontWeight: 600, color: "#111827" }}>
            {formatFullDate(ev.event_date)}
          </div>
          {time && (
            <div style={{ fontSize: ".85rem", color: "#6b7280", marginTop: ".1rem" }}>
              {time}
            </div>
          )}
        </div>

        {ev.location && (
          <div>
            <div style={lbl}>Where</div>
            <div style={{ fontSize: ".9rem", fontWeight: 600, color: "#111827", marginBottom: ".4rem" }}>
              📍 {ev.location}
            </div>
            <a
              href={directionsUrl(ev.location)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: ".35rem",
                padding: ".45rem .8rem", background: "#f0f4ff", color: "#1d4ed8",
                borderRadius: 9, fontSize: ".8rem", fontWeight: 700, textDecoration: "none",
              }}
            >
              🧭 Get Directions
            </a>
          </div>
        )}

        {ev.description && (
          <div>
            <div style={lbl}>Details</div>
            <p style={{ margin: 0, fontSize: ".85rem", color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {ev.description}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
