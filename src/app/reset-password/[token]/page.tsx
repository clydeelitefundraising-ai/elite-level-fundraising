import ResetPasswordView from "./ResetPasswordView";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // No server-side token validation here — the token's existence/validity
  // is never disclosed before the user submits a new password. The single
  // source of truth for whether a token is valid is the POST response from
  // /api/auth/reset-password.
  return <ResetPasswordView token={token} />;
}
