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
        background: "#0b1e3d",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1.5rem",
      }}>
        <Image
          src="/ELF.LOGO.png"
          alt="Elite Level Fundraising"
          width={110}
          height={110}
          style={{ borderRadius: "1.25rem", marginBottom: "1.75rem" }}
        />

        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div style={{
            color: "#C4A35A",
            fontWeight: 800,
            fontSize: ".72rem",
            letterSpacing: ".18em",
            textTransform: "uppercase",
            marginBottom: ".4rem",
          }}>
            Elite Level Fundraising
          </div>
          <div style={{
            color: "#fff",
            fontWeight: 800,
            fontSize: "2rem",
            letterSpacing: "-.02em",
            lineHeight: 1.1,
          }}>
            Team Hub
          </div>
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: ".75rem" }}>
          <Link href="/login" style={{
            display: "block",
            background: "#C4A35A",
            color: "#0b1e3d",
            textAlign: "center",
            fontWeight: 800,
            fontSize: "1.05rem",
            padding: "1rem",
            borderRadius: ".75rem",
            textDecoration: "none",
            letterSpacing: ".02em",
          }}>
            Log In
          </Link>
          <Link href="/enter-code" style={{
            display: "block",
            background: "rgba(255,255,255,.1)",
            color: "#fff",
            textAlign: "center",
            fontWeight: 700,
            fontSize: "1.05rem",
            padding: "1rem",
            borderRadius: ".75rem",
            textDecoration: "none",
            letterSpacing: ".02em",
            border: "1.5px solid rgba(255,255,255,.22)",
          }}>
            Enter Team Code
          </Link>
        </div>

        <p style={{
          color: "rgba(255,255,255,.35)",
          fontSize: ".75rem",
          textAlign: "center",
          marginTop: "3rem",
          lineHeight: 1.5,
        }}>
          Coaches: use your coach account to log in.
        </p>
      </div>
    </div>
  );
}
