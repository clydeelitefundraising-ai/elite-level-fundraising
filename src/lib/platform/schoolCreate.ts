// "Create new school" for Platform Admins (School Links). Server-only.
// Same table and insert primitive as team onboarding's
// resolveOrCreateOrganizationId (restInsert into organizations, slug from
// slugifyOrganizationName) — no second creation system. Differences, on
// purpose: duplicates are checked by normalized name + place against a
// strict (never-empty-on-failure) read, the slug is deterministic so the
// existing UNIQUE(slug) constraint makes a concurrent duplicate impossible,
// and a lost race is reported, never retried with a random suffix.
// Creating a school links nothing; linking still needs Preview + Confirm.
import { logAuditEvent } from "@/lib/auditLog";
import type { PlatformAdminIdentity } from "@/lib/platformAdminSession";
import { restInsert, RestError } from "./_client";
import { listAllOrganizations } from "./schoolLinks";
import { checkDuplicates, slugForNewSchool, type ExistingSchool, type NewSchoolInput } from "./schoolCreateLogic";

export type CreateSchoolResult =
  | { status: "created"; school: ExistingSchool }
  | { status: "duplicate"; existing: ExistingSchool }
  | { status: "similar"; similar: ExistingSchool[] };

export async function createSchool(
  input: NewSchoolInput,
  opts: { acknowledgeSimilar: boolean; admin: PlatformAdminIdentity; request: { ip: string | null; userAgent: string | null } },
): Promise<CreateSchoolResult> {
  // Strict read: a failure throws (the caller answers 503) instead of
  // looking like "no duplicates".
  const before = checkDuplicates(input, await listAllOrganizations() as ExistingSchool[]);
  if (before.kind === "duplicate") return { status: "duplicate", existing: before.existing };
  if (before.kind === "similar" && !opts.acknowledgeSimilar) return { status: "similar", similar: before.similar };

  const slug = slugForNewSchool(input, before.kind === "similar");
  let created: ExistingSchool;
  try {
    const rows = await restInsert<ExistingSchool>(
      "organizations?select=id,slug,school_name,city,state",
      { slug, school_name: input.school_name, city: input.city, state: input.state },
    );
    created = rows[0];
  } catch (err) {
    if (!(err instanceof RestError && err.code === "23505")) throw err;
    // Someone created the same school a moment ago (or the slug is taken):
    // report what exists now; never create a second record.
    const after = checkDuplicates(input, await listAllOrganizations() as ExistingSchool[]);
    if (after.kind === "duplicate") return { status: "duplicate", existing: after.existing };
    if (after.kind === "similar") return { status: "similar", similar: after.similar };
    throw err;
  }

  logAuditEvent({
    actor:       { type: "platform_admin", id: opts.admin.platformAdminId, email: opts.admin.email, name: opts.admin.name },
    action:      "organization.created",
    entity_type: "organization",
    entity_id:   created.id,
    summary:     `School created from School Links: ${created.school_name} — ${created.city}, ${created.state}`,
    new_value:   { school_name: created.school_name, city: created.city, state: created.state, slug: created.slug },
    ip_address:  opts.request.ip,
    user_agent:  opts.request.userAgent,
  });
  return { status: "created", school: created };
}
