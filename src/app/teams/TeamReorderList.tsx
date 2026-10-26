"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import type { TeamSummary } from "@/lib/accountSession";
import { teamRoleLabel } from "@/lib/permissions";
import { moveItem } from "@/lib/teamOrder";

// Custom Team Ordering — the Team Selector's reorder mode. Cards here are
// plain <div>s, never links: entering a team is disabled while reordering.
// Three equivalent ways to move a team:
//   * drag the grip handle (mouse, or touch after a short press so a
//     normal swipe still scrolls the page)
//   * keyboard on the focused handle: Space/Enter, arrows, Space/Enter
//   * the ↑/↓ buttons
// Single column at every width — reordering in the desktop 2-column grid
// would make "up" and "down" ambiguous.

type Props = {
  teams:    TeamSummary[];
  onChange: (slugs: string[]) => void;
  disabled: boolean;
};

export function teamReorderLabel(team: TeamSummary): string {
  return [team.school_name, team.sport_name, team.season].filter(Boolean).join(" ");
}

const srOnly: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0,
};

export default function TeamReorderList({ teams, onChange, disabled }: Props) {
  const [status, setStatus] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  // After an ↑/↓ move, keep keyboard focus on the moved team's control.
  const pendingFocus = useRef<{ slug: string; dir: "up" | "down" } | null>(null);

  const slugs = teams.map(t => t.campaign_slug);
  const labelFor = (slug: string | number) => {
    const team = teams.find(t => t.campaign_slug === slug);
    return team ? teamReorderLabel(team) : String(slug);
  };
  const positionOf = (slug: string | number) => slugs.indexOf(String(slug)) + 1;

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target || !listRef.current) return;
    pendingFocus.current = null;
    const q = (dir: string) =>
      listRef.current?.querySelector<HTMLButtonElement>(`button[data-slug="${CSS.escape(target.slug)}"][data-dir="${dir}"]`);
    const btn = q(target.dir);
    // At the top/bottom the pressed button is now disabled; fall back to
    // the opposite one so focus never drops to <body>.
    (btn && !btn.disabled ? btn : q(target.dir === "up" ? "down" : "up"))?.focus();
  }, [teams]);

  function move(index: number, dir: "up" | "down") {
    const to = dir === "up" ? index - 1 : index + 1;
    if (to < 0 || to >= teams.length) return;
    const slug = slugs[index];
    pendingFocus.current = { slug, dir };
    onChange(moveItem(slugs, index, to));
    setStatus(`${labelFor(slug)} moved to position ${to + 1} of ${teams.length}.`);
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = slugs.indexOf(String(active.id));
    const to   = slugs.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(moveItem(slugs, from, to));
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${labelFor(active.id)}. Position ${positionOf(active.id)} of ${teams.length}.`,
    onDragOver: ({ active, over }) =>
      over ? `${labelFor(active.id)} is over position ${positionOf(over.id)} of ${teams.length}.` : `${labelFor(active.id)} is not over a position.`,
    onDragEnd: ({ active, over }) =>
      over ? `${labelFor(active.id)} dropped at position ${positionOf(over.id)} of ${teams.length}.` : `${labelFor(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Reordering cancelled. ${labelFor(active.id)} returned to its position.`,
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To reorder, press Space or Enter to pick up this team, use the up and down arrow keys to move it, " +
              "then press Space or Enter to drop it. Press Escape to cancel.",
          },
        }}
      >
        <SortableContext items={slugs} strategy={verticalListSortingStrategy} disabled={disabled}>
          <ol
            ref={listRef}
            aria-label="Your teams, in display order"
            style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: ".65rem", width: "100%", maxWidth: 520, alignSelf: "center" }}
          >
            {teams.map((team, index) => (
              <SortableTeamRow
                key={team.campaign_slug}
                team={team}
                index={index}
                count={teams.length}
                disabled={disabled}
                onMove={move}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div aria-live="polite" role="status" style={srOnly}>{status}</div>
    </>
  );
}

function SortableTeamRow({
  team, index, count, disabled, onMove,
}: {
  team:     TeamSummary;
  index:    number;
  count:    number;
  disabled: boolean;
  onMove:   (index: number, dir: "up" | "down") => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: team.campaign_slug, disabled });

  const color = team.primary_color || "#121110";
  const label = teamReorderLabel(team);
  const detail = [team.sport_name, team.season].filter(Boolean).join(" · ");

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
        transition,
        position: "relative",
        zIndex: isDragging ? 2 : undefined,
        background: "#fff",
        borderRadius: "1rem",
        border: `1.5px solid ${isDragging ? color : "#e5e7eb"}`,
        boxShadow: isDragging ? "0 12px 30px rgba(11,30,61,.22)" : "0 2px 8px rgba(11,30,61,.08)",
        display: "flex", alignItems: "center", gap: ".6rem",
        padding: ".55rem .55rem .55rem .35rem",
      }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${label}`}
        disabled={disabled}
        style={{
          ...iconButton,
          cursor: disabled ? "default" : isDragging ? "grabbing" : "grab",
          // The handle owns its touch gestures (drag); the rest of the card
          // still scrolls the page normally.
          touchAction: "none",
          color: "#9ca3af",
        }}
      >
        <GripVertical size={22} aria-hidden="true" />
      </button>

      <div style={{
        width: 44, height: 44, borderRadius: ".75rem", flexShrink: 0,
        background: team.logo_url ? "#f5f6f8" : color,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: team.logo_url ? 5 : 0, boxSizing: "border-box",
      }}>
        {team.logo_url ? (
          <img src={team.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem" }}>
            {team.school_name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: ".95rem", color: "#121110", lineHeight: 1.25, overflowWrap: "anywhere" }}>
          {team.school_name}
        </div>
        {/* Sport + season at full strength so same-school teams are easy to tell apart. */}
        {detail && (
          <div style={{ fontWeight: 700, fontSize: ".84rem", color: "#374151", marginTop: ".15rem", lineHeight: 1.3, overflowWrap: "anywhere" }}>
            {detail}
          </div>
        )}
        {team.role && (
          <div style={{ fontSize: ".7rem", color: "#6b7280", marginTop: ".2rem", textTransform: "uppercase", letterSpacing: ".03em", fontWeight: 700 }}>
            {teamRoleLabel(team.role, team.role_kind)}
          </div>
        )}
        {/* Complete Season Phase 4: archived seasons are marked here too. */}
        {team.season_completed && (
          <div style={{ fontSize: ".7rem", color: "#4b5563", marginTop: ".2rem", textTransform: "uppercase", letterSpacing: ".03em", fontWeight: 700 }}>
            Completed
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: ".2rem", flexShrink: 0 }}>
        <button
          type="button"
          data-slug={team.campaign_slug}
          data-dir="up"
          aria-label={`Move ${label} up`}
          disabled={disabled || index === 0}
          onClick={() => onMove(index, "up")}
          style={{ ...iconButton, ...arrowButton, opacity: disabled || index === 0 ? 0.35 : 1 }}
        >
          <ChevronUp size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-slug={team.campaign_slug}
          data-dir="down"
          aria-label={`Move ${label} down`}
          disabled={disabled || index === count - 1}
          onClick={() => onMove(index, "down")}
          style={{ ...iconButton, ...arrowButton, opacity: disabled || index === count - 1 ? 0.35 : 1 }}
        >
          <ChevronDown size={20} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

const iconButton: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  minWidth: 44, minHeight: 44, padding: 0, flexShrink: 0,
  background: "none", border: "none", borderRadius: ".6rem",
};

const arrowButton: React.CSSProperties = {
  background: "#f3f4f6", color: "#374151", cursor: "pointer",
};
