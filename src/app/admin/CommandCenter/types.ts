export type ResultKind =
  | "campaign" | "athlete" | "coach" | "sponsor"
  | "page"     | "action"  | "demo"  | "audit";

export type CmdItem = {
  id:        string;
  kind:      ResultKind;
  label:     string;
  sublabel?: string;
  icon:      string;
  href?:     string;
  action?:   () => void | Promise<void>;
  group:     string;
};

export type CmdGroup = {
  label: string;
  items: CmdItem[];
};

// Serializable subset stored in localStorage
export type StoredItem = {
  id:        string;
  kind:      ResultKind;
  label:     string;
  sublabel?: string;
  icon:      string;
  href?:     string;
  group:     string;
  ts:        number;
};

// Shape returned by /api/admin/search
export type SearchResponse = {
  campaigns: { campaign_slug: string; school_name: string; sport_name: string; primary_color: string }[];
  athletes:  { id: string; name: string; event: string; campaign_slug: string; school_name?: string }[];
  coaches:   { id: string; name: string; role: string; campaign_slug: string; school_name?: string }[];
  sponsors:  { id: string; name: string; tier: string; campaign_slug: string; school_name?: string }[];
};
