import { restList } from "./_client";

export type DemoRequestStatus = "new" | "contacted" | "scheduled" | "closed";

export type DemoRequest = {
  id:            string;
  first_name:    string;
  last_name:     string;
  school_name:   string;
  sport_program: string | null;
  email:         string;
  role:          string;
  message:       string | null;
  status:        DemoRequestStatus;
  created_at:    string;
};

// ip/user_agent are deliberately excluded from this select — never exposed
// to the admin UI, per Phase 5 spec.
const LIST_SELECT = "id,first_name,last_name,school_name,sport_program,email,role,message,status,created_at";

export async function getDemoRequests(): Promise<DemoRequest[]> {
  return restList<DemoRequest>(`marketing_demo_requests?select=${LIST_SELECT}&order=created_at.desc&limit=500`);
}

export async function getDemoRequest(id: string): Promise<DemoRequest | null> {
  const rows = await restList<DemoRequest>(
    `marketing_demo_requests?id=eq.${encodeURIComponent(id)}&select=${LIST_SELECT}&limit=1`,
  );
  return rows[0] ?? null;
}
