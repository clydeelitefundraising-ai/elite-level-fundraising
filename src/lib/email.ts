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

async function sendEmail(to: string, subject: string, html: string): Promise<{ id: string }> {
  const from = getFromEmail();
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getResendKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
  const data = await res.json() as { id: string };
  console.log(`[email] sent id=${data.id} to=${to} from=${from} subject=${JSON.stringify(subject)}`);
  return data;
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

// ── Athlete / parent account welcome ──────────────────────────────────────────

export interface MemberWelcomeParams {
  to:          string;
  name:        string;
  teamName:    string;
  role:        "athlete" | "parent";
  teamHubUrl:  string;
  // True only when this join created a brand-new elf_accounts row. False
  // when an existing account (already had a password, possibly on another
  // team) just added this team — that case must not say "your account is
  // ready" / "welcome to ELF" as if an account was just created for them.
  isNewAccount: boolean;
}

export async function sendMemberWelcome(p: MemberWelcomeParams): Promise<void> {
  const roleLine = p.role === "athlete"
    ? "Your account is linked to your roster profile — donations, updates, and your fundraising page are all in one place."
    : "Your account is linked to your athlete's profile — you'll see their fundraising progress, team updates, and calendar right here.";

  const subject   = p.isNewAccount ? `Welcome to ${p.teamName} — Your ELF Account` : `You've joined ${p.teamName} on ELF`;
  const heading   = p.isNewAccount ? `Welcome to ${p.teamName}` : `You've joined ${p.teamName}`;
  const subheader = p.isNewAccount
    ? "Your Elite Level Fundraising account is ready."
    : "This team has been added to your existing ELF account — same email and password.";
  const footerLine = p.isNewAccount
    ? "This account works across every ELF team you join — no need to create a new one next season."
    : "You can switch between all your teams from the Team Selector after logging in.";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:520px;width:100%;">
        <tr><td style="padding-bottom:20px;">
          <h1 style="color:#0B1E3D;font-size:1.6rem;margin:0 0 8px 0;font-family:Arial,sans-serif;">${heading}</h1>
          <p style="color:#6b7280;margin:0;font-size:0.95rem;">${subheader}</p>
        </td></tr>
        <tr><td style="color:#374151;font-size:1rem;line-height:1.7;padding-bottom:24px;">
          <p style="margin:0;">Hi ${p.name},</p>
          <p style="margin:12px 0 0;">${roleLine}</p>
        </td></tr>
        <tr><td style="text-align:center;padding:8px 0 28px 0;">
          <a href="${p.teamHubUrl}" style="display:inline-block;background:#0B1E3D;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:1rem;font-weight:bold;">Open Team Hub &rarr;</a>
        </td></tr>
        <tr><td style="color:#9ca3af;font-size:0.8rem;text-align:center;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:24px;">
          ${footerLine}<br />
          Questions? <a href="mailto:support@elitelevelfundraising.com" style="color:#C4A35A;text-decoration:none;">support@elitelevelfundraising.com</a><br />
          <span style="display:inline-block;margin-top:12px;">Powered by Elite Level Fundraising</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(p.to, subject, html);
}

// ── Password reset ────────────────────────────────────────────────────────────

export interface PasswordResetParams {
  to:       string;
  name:     string;
  resetUrl: string;
}

export async function sendPasswordReset(p: PasswordResetParams): Promise<void> {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:520px;width:100%;">
        <tr><td style="padding-bottom:20px;">
          <h1 style="color:#0B1E3D;font-size:1.6rem;margin:0 0 8px 0;font-family:Arial,sans-serif;">Reset Your Password</h1>
        </td></tr>
        <tr><td style="color:#374151;font-size:1rem;line-height:1.7;padding-bottom:24px;">
          <p style="margin:0;">Hi ${p.name},</p>
          <p style="margin:12px 0 0;">We received a request to reset your ELF account password. Click below to choose a new one. This link expires in <strong>1 hour</strong> and can only be used once.</p>
        </td></tr>
        <tr><td style="text-align:center;padding:8px 0 28px 0;">
          <a href="${p.resetUrl}" style="display:inline-block;background:#0B1E3D;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:1rem;font-weight:bold;">Reset Password &rarr;</a>
        </td></tr>
        <tr><td style="background:#f5f6fa;border-radius:8px;padding:14px 16px;color:#6b7280;font-size:0.82rem;line-height:1.5;word-break:break-all;">
          Or copy this link: ${p.resetUrl}
        </td></tr>
        <tr><td style="color:#9ca3af;font-size:0.8rem;text-align:center;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:24px;">
          If you didn&rsquo;t request this, you can safely ignore this email — your password won&rsquo;t change.<br />
          Questions? <a href="mailto:support@elitelevelfundraising.com" style="color:#C4A35A;text-decoration:none;">support@elitelevelfundraising.com</a><br />
          <span style="display:inline-block;margin-top:12px;">Powered by Elite Level Fundraising</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(p.to, "Reset your ELF password", html);
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
