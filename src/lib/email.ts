/**
 * Transactional email via Resend (raw fetch — no SDK).
 *
 * Required env vars:
 *   RESEND_API_KEY   — from resend.com/api-keys
 *   FROM_EMAIL       — verified sender, e.g. "ELF <noreply@elitelevelfundraising.com>"
 *
 * Callers must wrap sendDonorReceipt / sendCoachWelcome in try/catch.
 * Failures are the caller's responsibility to log; this module throws on error.
 */

const RESEND_API = "https://api.resend.com/emails";

function getResendKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY environment variable is not set");
  return key;
}

function getFromEmail(): string {
  return process.env.FROM_EMAIL ?? "ELF Fundraising <noreply@elitelevelfundraising.com>";
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getResendKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: getFromEmail(), to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

// ── Donor receipt ─────────────────────────────────────────────────────────────

export interface DonorReceiptParams {
  to:           string;
  donorName:    string | null;
  amountCents:  number;
  teamName:     string;
  athleteName:  string | null;
  campaignUrl:  string;
}

export async function sendDonorReceipt(p: DonorReceiptParams): Promise<void> {
  const amount = (p.amountCents / 100).toLocaleString("en-US", {
    style:    "currency",
    currency: "USD",
  });
  const greeting    = p.donorName ? `Hi ${p.donorName},` : "Hi there,";
  const supportLine = p.athleteName
    ? `Your gift supports <strong>${p.athleteName}</strong> and the ${p.teamName} program.`
    : `Your gift supports the <strong>${p.teamName}</strong> program.`;
  const athleteRow = p.athleteName
    ? `<tr>
        <td style="color:#6b7280;font-size:0.9rem;padding:8px;">Athlete</td>
        <td style="text-align:right;color:#0B1E3D;font-size:0.9rem;padding:8px;">${p.athleteName}</td>
       </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:520px;width:100%;">
        <tr><td style="text-align:center;padding-bottom:24px;">
          <div style="font-size:2.4rem;">🎉</div>
          <h1 style="color:#0B1E3D;font-size:1.8rem;margin:8px 0 0 0;font-family:Arial,sans-serif;">Thank You!</h1>
        </td></tr>
        <tr><td style="color:#374151;font-size:1rem;line-height:1.7;padding-bottom:24px;">
          <p style="margin:0 0 12px 0;">${greeting}</p>
          <p style="margin:0 0 12px 0;">We received your donation of <strong>${amount}</strong>. ${supportLine}</p>
          <p style="margin:0;">Every dollar makes a real difference for our student athletes this season — thank you for your support.</p>
        </td></tr>
        <tr><td style="border-top:1px solid #e5e7eb;padding:24px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;border-radius:8px;">
            <tr>
              <td style="color:#6b7280;font-size:0.9rem;padding:8px;">Amount</td>
              <td style="text-align:right;font-weight:bold;color:#0B1E3D;font-size:0.9rem;padding:8px;">${amount}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;font-size:0.9rem;padding:8px;">Team</td>
              <td style="text-align:right;color:#0B1E3D;font-size:0.9rem;padding:8px;">${p.teamName}</td>
            </tr>
            ${athleteRow}
          </table>
        </td></tr>
        <tr><td style="text-align:center;padding:8px 0 28px 0;">
          <a href="${p.campaignUrl}" style="display:inline-block;background:#0B1E3D;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:1rem;font-weight:bold;">View Campaign</a>
        </td></tr>
        <tr><td style="color:#9ca3af;font-size:0.8rem;text-align:center;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:24px;">
          Questions? Contact us at <a href="mailto:billing@elitelevelfundraising.com" style="color:#C4A35A;text-decoration:none;">billing@elitelevelfundraising.com</a><br />
          <span style="display:inline-block;margin-top:12px;">Powered by Elite Level Fundraising</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(p.to, `Donation Receipt — ${p.teamName}`, html);
}

// ── Coach welcome ─────────────────────────────────────────────────────────────

export interface CoachWelcomeParams {
  to:           string;
  coachName:    string;
  teamName:     string;
  loginUrl:     string;
  email:        string;
  tempPassword: string;
  teamHubUrl:   string;
}

export async function sendCoachWelcome(p: CoachWelcomeParams): Promise<void> {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:520px;width:100%;">
        <tr><td style="padding-bottom:20px;">
          <h1 style="color:#0B1E3D;font-size:1.6rem;margin:0 0 8px 0;font-family:Arial,sans-serif;">Welcome, ${p.coachName}!</h1>
          <p style="color:#6b7280;margin:0;font-size:0.95rem;">Your coach account for <strong>${p.teamName}</strong> is ready.</p>
        </td></tr>
        <tr><td style="color:#374151;font-size:1rem;line-height:1.7;padding-bottom:20px;">
          <p style="margin:0;">Use the credentials below to log in and manage your team's fundraising campaign.</p>
        </td></tr>
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;border-radius:8px;">
            <tr>
              <td style="color:#6b7280;font-size:0.9rem;padding:10px 12px;width:120px;vertical-align:top;">Login URL</td>
              <td style="padding:10px 12px;"><a href="${p.loginUrl}" style="color:#C4A35A;text-decoration:none;">${p.loginUrl}</a></td>
            </tr>
            <tr style="border-top:1px solid #e5e7eb;">
              <td style="color:#6b7280;font-size:0.9rem;padding:10px 12px;vertical-align:top;">Email</td>
              <td style="color:#0B1E3D;font-size:0.9rem;padding:10px 12px;">${p.email}</td>
            </tr>
            <tr style="border-top:1px solid #e5e7eb;">
              <td style="color:#6b7280;font-size:0.9rem;padding:10px 12px;vertical-align:top;">Password</td>
              <td style="font-family:monospace;font-size:1rem;color:#0B1E3D;letter-spacing:0.05em;padding:10px 12px;">${p.tempPassword}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="background:#fef9ec;border:1px solid #C4A35A;border-radius:8px;padding:14px 16px;margin-bottom:20px;color:#0B1E3D;font-size:0.9rem;line-height:1.5;">
          <strong>Security reminder:</strong> Change your password after your first login.
        </td></tr>
        <tr><td style="text-align:center;padding:24px 0;">
          <a href="${p.teamHubUrl}" style="display:inline-block;background:#0B1E3D;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:1rem;font-weight:bold;">Go to Team Hub →</a>
        </td></tr>
        <tr><td style="color:#9ca3af;font-size:0.8rem;text-align:center;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:24px;">
          Questions? Contact us at <a href="mailto:support@elitelevelfundraising.com" style="color:#C4A35A;text-decoration:none;">support@elitelevelfundraising.com</a><br />
          <span style="display:inline-block;margin-top:12px;">Powered by Elite Level Fundraising</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(p.to, `Welcome to ${p.teamName} — Your ELF Coach Login`, html);
}

// ── Coach account invite / reset ──────────────────────────────────────────────

export interface CoachInviteParams {
  to:        string;
  coachName: string;
  teamName:  string;
  inviteUrl: string;
}

export async function sendCoachInvite(p: CoachInviteParams): Promise<void> {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:520px;width:100%;">
        <tr><td style="padding-bottom:20px;">
          <h1 style="color:#0B1E3D;font-size:1.6rem;margin:0 0 8px 0;font-family:Arial,sans-serif;">Set Up Your Coach Account</h1>
          <p style="color:#6b7280;margin:0;font-size:0.95rem;">You&rsquo;ve been invited to access <strong>${p.teamName}</strong> on Elite Level Fundraising.</p>
        </td></tr>
        <tr><td style="color:#374151;font-size:1rem;line-height:1.7;padding-bottom:24px;">
          <p style="margin:0;">Hi ${p.coachName},</p>
          <p style="margin:12px 0 0;">Click the button below to create your ELF account password. This link expires in <strong>24 hours</strong> and can only be used once.</p>
        </td></tr>
        <tr><td style="text-align:center;padding:8px 0 28px 0;">
          <a href="${p.inviteUrl}" style="display:inline-block;background:#0B1E3D;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:1rem;font-weight:bold;">Set My Password &rarr;</a>
        </td></tr>
        <tr><td style="background:#f5f6fa;border-radius:8px;padding:14px 16px;color:#6b7280;font-size:0.82rem;line-height:1.5;word-break:break-all;">
          Or copy this link: ${p.inviteUrl}
        </td></tr>
        <tr><td style="color:#9ca3af;font-size:0.8rem;text-align:center;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:24px;">
          If you didn&rsquo;t expect this email, you can ignore it.<br />
          Questions? <a href="mailto:support@elitelevelfundraising.com" style="color:#C4A35A;text-decoration:none;">support@elitelevelfundraising.com</a><br />
          <span style="display:inline-block;margin-top:12px;">Powered by Elite Level Fundraising</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(p.to, `Set up your ELF coach account — ${p.teamName}`, html);
}

// ── Team Staff invite (Phase A28 — Head Coach-issued Assistant Coach / Booster) ──

export interface StaffInviteParams {
  to:         string;
  inviteeName: string;
  teamName:   string;
  inviterName: string;
  role:       "assistant_coach" | "booster";
  inviteUrl:  string;
}

export async function sendStaffInvite(p: StaffInviteParams): Promise<void> {
  const roleLabel = p.role === "assistant_coach" ? "Assistant Coach" : "Booster";
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:520px;width:100%;">
        <tr><td style="padding-bottom:20px;">
          <h1 style="color:#0B1E3D;font-size:1.6rem;margin:0 0 8px 0;font-family:Arial,sans-serif;">You&rsquo;ve Been Invited</h1>
          <p style="color:#6b7280;margin:0;font-size:0.95rem;">${p.inviterName} invited you to join <strong>${p.teamName}</strong> on Elite Level Fundraising.</p>
        </td></tr>
        <tr><td style="color:#374151;font-size:1rem;line-height:1.7;padding-bottom:20px;">
          <p style="margin:0;">Hi ${p.inviteeName},</p>
          <p style="margin:12px 0 0;">You&rsquo;ve been invited to help run <strong>${p.teamName}</strong> as a <strong>${roleLabel}</strong>. Click below to create your password and get access. This link expires in <strong>24 hours</strong> and can only be used once.</p>
        </td></tr>
        <tr><td style="text-align:center;padding:8px 0 28px 0;">
          <a href="${p.inviteUrl}" style="display:inline-block;background:#0B1E3D;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:1rem;font-weight:bold;">Accept Invitation &rarr;</a>
        </td></tr>
        <tr><td style="background:#f5f6fa;border-radius:8px;padding:14px 16px;color:#6b7280;font-size:0.82rem;line-height:1.5;word-break:break-all;">
          Or copy this link: ${p.inviteUrl}
        </td></tr>
        <tr><td style="color:#9ca3af;font-size:0.8rem;text-align:center;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:24px;">
          If you didn&rsquo;t expect this email, you can ignore it.<br />
          Questions? <a href="mailto:support@elitelevelfundraising.com" style="color:#C4A35A;text-decoration:none;">support@elitelevelfundraising.com</a><br />
          <span style="display:inline-block;margin-top:12px;">Powered by Elite Level Fundraising</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(p.to, `You've been invited to join ${p.teamName} on Elite Level Fundraising`, html);
}

// ── Marketing: demo request notification (to ELF) ─────────────────────────────

export interface DemoRequestNotificationParams {
  to:            string;
  firstName:     string;
  lastName:      string;
  schoolName:    string;
  sportProgram:  string | null;
  email:         string;
  role:          string;
  message:       string | null;
}

export async function sendDemoRequestNotification(p: DemoRequestNotificationParams): Promise<void> {
  const rows: Array<[string, string]> = [
    ["Name", `${p.firstName} ${p.lastName}`],
    ["School", p.schoolName],
    ["Sport / Program", p.sportProgram || "—"],
    ["Role", p.role],
    ["Email", p.email],
  ];
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="color:#6b7280;font-size:0.9rem;padding:8px;width:140px;">${label}</td><td style="color:#0B1E3D;font-size:0.9rem;padding:8px;">${value}</td></tr>`,
    )
    .join("");
  const messageBlock = p.message
    ? `<tr><td style="color:#374151;font-size:0.95rem;line-height:1.6;padding:16px 8px 0;" colspan="2">${p.message}</td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:520px;width:100%;">
        <tr><td style="padding-bottom:16px;">
          <h1 style="color:#0B1E3D;font-size:1.5rem;margin:0;">New Demo Request</h1>
        </td></tr>
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;border-radius:8px;">
            ${rowsHtml}
            ${messageBlock}
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(p.to, `New demo request — ${p.schoolName}`, html);
}

// ── Marketing: demo request confirmation (to prospect) ─────────────────────────

export interface DemoRequestConfirmationParams {
  to:        string;
  firstName: string;
}

export async function sendDemoRequestConfirmation(p: DemoRequestConfirmationParams): Promise<void> {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:520px;width:100%;">
        <tr><td style="padding-bottom:20px;">
          <h1 style="color:#0B1E3D;font-size:1.5rem;margin:0 0 8px 0;">Thanks, ${p.firstName}!</h1>
          <p style="color:#6b7280;margin:0;font-size:0.95rem;">We received your demo request.</p>
        </td></tr>
        <tr><td style="color:#374151;font-size:1rem;line-height:1.7;padding-bottom:8px;">
          <p style="margin:0;">A member of our team will follow up shortly to schedule a walkthrough built around your program. In the meantime, feel free to reply directly to this email with any questions.</p>
        </td></tr>
        <tr><td style="color:#9ca3af;font-size:0.8rem;text-align:center;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:24px;margin-top:20px;">
          Questions? Contact us at <a href="mailto:sales@elitelevelfundraising.com" style="color:#C4A35A;text-decoration:none;">sales@elitelevelfundraising.com</a><br />
          <span style="display:inline-block;margin-top:12px;">Elite Level Fundraising</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(p.to, "We received your demo request — Elite Level Fundraising", html);
}
