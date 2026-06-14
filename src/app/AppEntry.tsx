import Image from "next/image";
import Link from "next/link";

export default function AppEntry() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0b1e3d",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 430,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Decorative background rings */}
        <div style={{ position: "absolute", top: -80, right: -80, width: 320, height: 320, borderRadius: "50%", border: "1px solid rgba(196,163,90,.12)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: -40, right: -40, width: 220, height: 220, borderRadius: "50%", border: "1px solid rgba(196,163,90,.08)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 40, left: -60, width: 260, height: 260, borderRadius: "50%", border: "1px solid rgba(255,255,255,.05)", pointerEvents: "none" }} />

        {/* Main content */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem 1.75rem 2rem",
          position: "relative",
          zIndex: 1,
        }}>
          {/* Logo + app badge */}
          <div style={{ marginBottom: "2.25rem", textAlign: "center" }}>
            <div style={{ display: "inline-block", position: "relative" }}>
              <div style={{
                position: "absolute", inset: -8,
                borderRadius: "1.75rem",
                background: "radial-gradient(circle, rgba(196,163,90,.2) 0%, transparent 70%)",
              }} />
              <Image
                src="/ELF.LOGO.png"
                alt="Elite Level Fundraising"
                width={96}
                height={96}
                style={{ borderRadius: "1.35rem", display: "block", position: "relative" }}
              />
            </div>
          </div>

          {/* Wordmark */}
          <div style={{ textAlign: "center", marginBottom: "2.75rem" }}>
            <div style={{
              color: "#C4A35A",
              fontWeight: 700,
              fontSize: ".68rem",
              letterSpacing: ".22em",
              textTransform: "uppercase",
              marginBottom: ".55rem",
              opacity: .9,
            }}>
              Elite Level Fundraising
            </div>
            <div style={{
              color: "#fff",
              fontWeight: 800,
              fontSize: "2.2rem",
              letterSpacing: "-.025em",
              lineHeight: 1.05,
              marginBottom: "1.25rem",
            }}>
              Team Hub
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: ".22rem" }}>
              {["Stay connected.", "Track fundraising.", "Support your team."].map(line => (
                <div key={line} style={{ color: "rgba(255,255,255,.55)", fontSize: ".92rem", fontWeight: 500, letterSpacing: ".01em" }}>
                  {line}
                </div>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: ".75rem" }}>
            <Link href="/login" style={{
              display: "block",
              background: "#C4A35A",
              color: "#0b1e3d",
              textAlign: "center",
              fontWeight: 800,
              fontSize: "1.05rem",
              padding: "1rem",
              borderRadius: ".85rem",
              textDecoration: "none",
              letterSpacing: ".02em",
              boxShadow: "0 4px 18px rgba(196,163,90,.35)",
            }}>
              Log In
            </Link>
            <Link href="/enter-code" style={{
              display: "block",
              background: "rgba(255,255,255,.08)",
              color: "#fff",
              textAlign: "center",
              fontWeight: 700,
              fontSize: "1.05rem",
              padding: "1rem",
              borderRadius: ".85rem",
              textDecoration: "none",
              letterSpacing: ".02em",
              border: "1.5px solid rgba(255,255,255,.18)",
            }}>
              Enter Team Code
            </Link>
          </div>
        </div>

        {/* Footer note */}
        <div style={{ padding: "1rem 1.75rem 2rem", textAlign: "center", position: "relative", zIndex: 1 }}>
          <p style={{
            color: "rgba(255,255,255,.28)",
            fontSize: ".72rem",
            lineHeight: 1.55,
            margin: 0,
          }}>
            Coaches: log in with your coach account.<br />
            Athletes &amp; parents: use your team code to join.
          </p>
        </div>
      </div>
    </div>
  );
}
