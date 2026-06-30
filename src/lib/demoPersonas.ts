export type DemoPersonaId = "public" | "admin" | "coach" | "athlete" | "parent";

export type DemoPersona = {
  id:           DemoPersonaId;
  label:        string;
  icon:         string;
  description:  string;
  hint:         string;
  accent:       string;
  accentBorder: string;
  accentText:   string;
};

// Extensible — add future personas (booster, sponsor, district_admin, etc.) here.
export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id:           "public",
    label:        "Public Fundraiser",
    icon:         "🌎",
    description:  "Experience exactly what a donor sees.",
    hint:         "Opens the live campaign page — no login required.",
    accent:       "#f0fdf4",
    accentBorder: "#86efac",
    accentText:   "#166534",
  },
  {
    id:           "admin",
    label:        "Athletic Director",
    icon:         "👔",
    description:  "Experience the full administrative portal.",
    hint:         "Opens the Admin Portal pre-authenticated.",
    accent:       "#eff6ff",
    accentBorder: "#93c5fd",
    accentText:   "#1e40af",
  },
  {
    id:           "coach",
    label:        "Coach",
    icon:         "👨‍💼",
    description:  "Experience the Team App from the coach perspective.",
    hint:         "Opens the Team Hub as the demo head coach.",
    accent:       "#f0f9ff",
    accentBorder: "#7dd3fc",
    accentText:   "#0c4a6e",
  },
  {
    id:           "athlete",
    label:        "Athlete",
    icon:         "🏃",
    description:  "Experience the Team App from the athlete perspective.",
    hint:         "Opens the Team Hub as a demo athlete.",
    accent:       "#fff7ed",
    accentBorder: "#fdba74",
    accentText:   "#9a3412",
  },
  {
    id:           "parent",
    label:        "Parent",
    icon:         "👨‍👩‍👧",
    description:  "Experience the Team App from the parent perspective.",
    hint:         "Opens the Team Hub as a demo parent.",
    accent:       "#fdf4ff",
    accentBorder: "#d8b4fe",
    accentText:   "#6b21a8",
  },
];

export const DEMO_SLUG         = "elf-demo";
export const DEMO_COACH_EMAIL   = "demo-coach@elf.local";
export const DEMO_ATHLETE_EMAIL = "demo-athlete@elf.local";
export const DEMO_PARENT_EMAIL  = "demo-parent@elf.local";
export const DEMO_TEMPLATE_ID   = "football";
