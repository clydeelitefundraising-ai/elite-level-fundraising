// Shown instead of the New Campaign / Duplicate wizards to an admin signed in
// with the shared /admin password: production campaigns need a school, and
// choosing or creating one needs an individual Platform Admin account. The
// onboard and duplicate APIs refuse the shared password independently (403).
export default function PlatformAdminRequired({ action }: { action: string }) {
  return (
    <div style={{ maxWidth: 480, margin: "3rem auto", textAlign: "center", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0b1e3d", margin: "0 0 .6rem" }}>
        Platform Admin Sign-In Required
      </h1>
      <p style={{ fontSize: ".88rem", color: "#4b5563", lineHeight: 1.6, margin: "0 0 1.25rem" }}>
        {action} links the campaign to its school, which requires your individual ELF Platform Admin
        account, separate from the Admin Portal password. Sign in below, then return to this page.
        Demo tools are unchanged.
      </p>
      <a
        href="/login"
        style={{ display: "inline-block", padding: ".6rem 1.25rem", background: "#0b1e3d", color: "#fff", borderRadius: 8, fontSize: ".85rem", fontWeight: 700, textDecoration: "none" }}
      >
        Sign In
      </a>
    </div>
  );
}
