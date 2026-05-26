// ─────────────────────────────────────────────────────────────────────────────
// Team App Portal — Mock Data
// TODO (Supabase): Replace each export with a typed server-side query.
//   Pattern: const { data } = await supabase.from('table').select('*').eq('team_id', id)
// ─────────────────────────────────────────────────────────────────────────────

export const teamInfo = {
  school:       "Paradise Valley High School",
  shortName:    "Paradise Valley",
  mascot:       "Trojans",
  sport:        "Track & Field",
  season:       "Spring 2025",
  logoInitials: "PV",
};

// Used in the Home hero banner
export const heroStats = [
  { label: "STATE QUALIFIERS", value: "8"  },
  { label: "SCHOOL RECORDS",   value: "3"  },
  { label: "ATHLETES",         value: "24" },
];

// TODO (Supabase): campaigns table — active campaign for this team
export const fundraisingData = {
  campaignName: "Spring 2025 State Championship Fund",
  goal:         15000,
  raised:       9240,
  donors:       87,
  daysLeft:     14,
  avgDonation:  106,
};

// TODO (Supabase): announcements table, ordered by created_at desc
export const announcements = [
  {
    id:   1,
    title: "State Championship Bound!",
    body:  "The Trojans qualified for the AIA 5A State Championship. Join us May 10th at Mesa Community College Track & Field Complex.",
    date:  "Apr 28, 2025",
    type:  "milestone" as const,
  },
  {
    id:   2,
    title: "Fundraiser Deadline Approaching",
    body:  "Only 14 days left in our Spring fundraiser. Share your link and help us reach $15,000!",
    date:  "Apr 25, 2025",
    type:  "fundraiser" as const,
  },
];

// TODO (Supabase): athletes table — athletes.team_id = teamId
export const athletes = [
  { id: 1,  name: "Marcus Johnson",  number: 12, position: "Sprints",      gradYear: 2025, initials: "MJ" },
  { id: 2,  name: "Sofia Reyes",     number: 7,  position: "Distance",     gradYear: 2026, initials: "SR" },
  { id: 3,  name: "Darius Williams", number: 24, position: "Jumps",        gradYear: 2025, initials: "DW" },
  { id: 4,  name: "Aaliyah Torres",  number: 3,  position: "Throws",       gradYear: 2027, initials: "AT" },
  { id: 5,  name: "Ethan Park",      number: 18, position: "Hurdles",      gradYear: 2026, initials: "EP" },
  { id: 6,  name: "Jasmine Cole",    number: 9,  position: "Sprints",      gradYear: 2025, initials: "JC" },
  { id: 7,  name: "Tyler Brooks",    number: 31, position: "Distance",     gradYear: 2028, initials: "TB" },
  { id: 8,  name: "Priya Patel",     number: 15, position: "Field Events", gradYear: 2026, initials: "PP" },
  { id: 9,  name: "Cameron Lee",     number: 22, position: "Relays",       gradYear: 2027, initials: "CL" },
  { id: 10, name: "Destiny Hughes",  number: 6,  position: "Jumps",        gradYear: 2025, initials: "DH" },
];

// Athlete featured on the Home spotlight card
export const spotlightAthlete = {
  id:        1,
  name:      "Marcus Johnson",
  number:    12,
  position:  "Sprints",
  gradYear:  2025,
  initials:  "MJ",
  badge:     "Team Captain",
  stats: [
    { label: "100m PR", value: "10.82s" },
    { label: "200m PR", value: "21.47s" },
    { label: "Raised",  value: "$1,240" },
  ],
};

// TODO (Supabase): aggregate donations by athlete_id for the active campaign
export const leaderboard = [
  { id: 1, name: "Marcus Johnson",  initials: "MJ", raised: 1240, donors: 14 },
  { id: 2, name: "Sofia Reyes",     initials: "SR", raised: 980,  donors: 11 },
  { id: 3, name: "Darius Williams", initials: "DW", raised: 875,  donors: 9  },
  { id: 4, name: "Aaliyah Torres",  initials: "AT", raised: 720,  donors: 8  },
  { id: 5, name: "Ethan Park",      initials: "EP", raised: 660,  donors: 7  },
];

// TODO (Supabase): products table joined with team_shop, filter by team_id
export const products = [
  { id: 1, name: "Team Hoodie",      price: 55, category: "Outerwear",    status: "available"   as const, description: "Premium fleece pullover with embroidered logo",  swatchColor: "#0B1E3D" },
  { id: 2, name: "Performance Tee",  price: 28, category: "Tops",         status: "available"   as const, description: "Moisture-wicking game-day shirt",               swatchColor: "#C9A84C" },
  { id: 3, name: "Snapback Hat",     price: 32, category: "Accessories",  status: "coming_soon" as const, description: "Structured snapback with team crest",            swatchColor: "#0A0A0A" },
  { id: 4, name: "Classic Tee",      price: 24, category: "Tops",         status: "available"   as const, description: "100% cotton spirit wear tee",                   swatchColor: "#F5F0EA" },
  { id: 5, name: "Track Shorts",     price: 38, category: "Bottoms",      status: "coming_soon" as const, description: "Lightweight training shorts with pockets",      swatchColor: "#1A3A5C" },
  { id: 6, name: "Drawstring Bag",   price: 18, category: "Accessories",  status: "available"   as const, description: "Lightweight cinch bag with team logo",           swatchColor: "#C9A84C" },
];

// TODO (Supabase): events table, filter by team_id, order by event_date asc, where event_date >= now()
export const calendarEvents = [
  { id: 1, title: "Morning Practice",       date: "May 1, 2025",  time: "6:00 AM",  location: "PV Track",           type: "practice"   as const },
  { id: 2, title: "Chandler Invitational",  date: "May 3, 2025",  time: "8:00 AM",  location: "Chandler High School",type: "game"       as const },
  { id: 3, title: "Fundraiser Deadline",    date: "May 6, 2025",  time: "11:59 PM", location: "Online",              type: "fundraiser" as const },
  { id: 4, title: "Team Banquet",           date: "May 8, 2025",  time: "6:30 PM",  location: "PV Cafeteria",        type: "team"       as const },
  { id: 5, title: "AIA State Championship", date: "May 10, 2025", time: "9:00 AM",  location: "Mesa CC Track",       type: "game"       as const },
  { id: 6, title: "Morning Practice",       date: "May 12, 2025", time: "6:00 AM",  location: "PV Track",            type: "practice"   as const },
  { id: 7, title: "End-of-Season Meeting",  date: "May 15, 2025", time: "3:30 PM",  location: "Gym B",               type: "team"       as const },
];

// ── Types for teamUpdates ────────────────────────────────────────────────────
export type UpdateCategory = "schedule" | "fundraiser" | "travel" | "meet-info" | "team-alert";
export type UpdateAttachmentType = "pdf" | "heat-sheet" | "drive" | "image";
export type UpdateAttachment = { type: UpdateAttachmentType; label: string; meta?: string };
export type UpdatePriority = "normal" | "high" | "pinned";
export type AuthorRole = "Head Coach" | "Assistant Coach" | "Admin" | "Booster Club";
export type TeamUpdate = {
  id: number;
  title: string;
  body: string;
  category: UpdateCategory;
  priority: UpdatePriority;
  author: string;
  authorRole: AuthorRole;
  authorInitials: string;
  timestamp: string;
  timeGroup: "today" | "yesterday" | string;
  read: boolean;
  attachments?: UpdateAttachment[];
};

// TODO (Supabase): updates table — filter by team_id, order by pinned desc, created_at desc
export const teamUpdates: TeamUpdate[] = [
  {
    id: 1,
    title: "AIA State Championship — Everything You Need to Know",
    body: "We made it! Here is all the info for state on May 10th. Bus departs at 5:30 AM from the North lot — be there by 5:15 AM with all gear packed. Athletes must be in full uniform before loading. Spectator entry, warm-up schedule, and hotel info are all attached below.",
    category: "meet-info",
    priority: "pinned",
    author: "Coach Williams",
    authorRole: "Head Coach",
    authorInitials: "CW",
    timestamp: "Apr 30 · 9:00 AM",
    timeGroup: "pinned",
    read: false,
    attachments: [
      { type: "heat-sheet", label: "State Championship Heat Sheet", meta: "18 heats · 6 events" },
      { type: "drive",      label: "Travel & Hotel Info",           meta: "Google Drive" },
    ],
  },
  {
    id: 2,
    title: "Bus Departure — 5:30 AM Sharp on Saturday",
    body: "Reminder: the bus leaves at 5:30 AM Saturday from the North parking lot. Be there by 5:15 with all gear. No late departures — this is state. Bring your school ID and athlete registration card.",
    category: "schedule",
    priority: "high",
    author: "Coach Williams",
    authorRole: "Head Coach",
    authorInitials: "CW",
    timestamp: "2h ago",
    timeGroup: "today",
    read: false,
  },
  {
    id: 3,
    title: "Chandler Invitational Heat Sheets Posted",
    body: "Heat sheets for Saturday's Chandler Invitational are now live. Check your events, report times, and warm-up lanes. All field athletes report 30 min before first flight. Distance runners check in at the clerk tent.",
    category: "meet-info",
    priority: "normal",
    author: "Coach Williams",
    authorRole: "Head Coach",
    authorInitials: "CW",
    timestamp: "4h ago",
    timeGroup: "today",
    read: false,
    attachments: [
      { type: "heat-sheet", label: "Chandler Invite Heat Sheet", meta: "12 heats · 8 events" },
    ],
  },
  {
    id: 4,
    title: "Practice Cancelled — Tuesday May 13",
    body: "No practice this Tuesday due to school-wide testing. The gym and track are closed all day. Wednesday practice is on as normal at 3:30 PM. Use Tuesday for rest, recovery, and mental prep.",
    category: "team-alert",
    priority: "high",
    author: "Coach Williams",
    authorRole: "Head Coach",
    authorInitials: "CW",
    timestamp: "Yesterday · 5:15 PM",
    timeGroup: "yesterday",
    read: true,
  },
  {
    id: 5,
    title: "Final Fundraiser Push — 8 Days Left!",
    body: "We're at 62% of our $15,000 goal. Every share counts — send your personal link to family, neighbors, and your networks. Top three fundraisers get a surprise gift from the booster club. Let's finish strong!",
    category: "fundraiser",
    priority: "normal",
    author: "Booster Club",
    authorRole: "Booster Club",
    authorInitials: "BC",
    timestamp: "Yesterday · 2:00 PM",
    timeGroup: "yesterday",
    read: true,
    attachments: [
      { type: "drive", label: "Fundraiser Tips & Ask Script", meta: "Google Drive" },
    ],
  },
  {
    id: 6,
    title: "Team Banquet RSVP Due May 5th",
    body: "Please RSVP for the end-of-season banquet by May 5th so we can finalize catering. Dinner starts at 6:30 PM in the PV Cafeteria on May 8th. Athletes eat free — parents are $15 at the door. RSVP form attached.",
    category: "team-alert",
    priority: "normal",
    author: "Ms. Rodriguez",
    authorRole: "Admin",
    authorInitials: "MR",
    timestamp: "Apr 29 · 10:00 AM",
    timeGroup: "Apr 29",
    read: true,
    attachments: [
      { type: "pdf", label: "Banquet RSVP Form", meta: "1 page" },
    ],
  },
  {
    id: 7,
    title: "State Travel Itinerary — Hotels & Pickup Times",
    body: "Full travel itinerary for State is now posted. Parents — please review pickup times carefully. Hotel check-in is at 3 PM Friday May 9th. Athletes should be packed and ready no later than 5:00 AM Saturday.",
    category: "travel",
    priority: "normal",
    author: "Ms. Rodriguez",
    authorRole: "Admin",
    authorInitials: "MR",
    timestamp: "Apr 28 · 4:30 PM",
    timeGroup: "Apr 28",
    read: true,
    attachments: [
      { type: "pdf",   label: "State Travel Itinerary",    meta: "3 pages · 1.2 MB" },
      { type: "drive", label: "Hotel Confirmation Docs",   meta: "Google Drive" },
    ],
  },
  {
    id: 8,
    title: "Great Meet at Mesa Invitational — 3 School Records!",
    body: "What a meet! Marcus broke the 100m school record with a 10.82, Sofia crushed the 1600m with a 4:52, and the 4×400 relay set a new school best. We are so proud of everyone. Photos from the meet are posted below.",
    category: "schedule",
    priority: "normal",
    author: "Coach Williams",
    authorRole: "Head Coach",
    authorInitials: "CW",
    timestamp: "Apr 27 · 8:00 PM",
    timeGroup: "Apr 27",
    read: true,
    attachments: [
      { type: "image", label: "Team Photo — Mesa Invitational", meta: "4 photos" },
    ],
  },
];

// TODO (Supabase): sponsors table, filter by team_id, order by tier rank
export const sponsors = [
  { id: 1, name: "Arizona Athletic Supply",    tier: "Gold"   as const, tagline: "Outfitting Champions Since 1998",        initials: "AAS", accentColor: "#C9A84C" },
  { id: 2, name: "Valley Health & Performance",tier: "Gold"   as const, tagline: "Keeping Athletes at Peak Performance",   initials: "VHP", accentColor: "#C9A84C" },
  { id: 3, name: "Desert Sun Realty",          tier: "Silver" as const, tagline: "Your Local Real Estate Experts",         initials: "DSR", accentColor: "#9CA3AF" },
  { id: 4, name: "Mesa Coffee Co.",            tier: "Bronze" as const, tagline: "Fueling Your Morning Grind",             initials: "MCC", accentColor: "#B87333" },
];
