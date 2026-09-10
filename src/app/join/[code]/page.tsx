import { redirect } from "next/navigation";
import Image from "next/image";
import { resolveJoinCode } from "@/lib/teamData";
import { CrownMark } from "@/components/marketing/brand-marks/BrandMarks";
import { authDisplayFont } from "@/components/auth/authDisplayFont";
import { entryPhotoForOffset, ENTRY_PHOTO_OFFSET, type EntryPhoto } from "@/components/auth/entryPhotos";
import entryStyles from "@/components/auth/authEntry.module.css";
import joinStyles from "./JoinError.module.css";

// Compatibility route — Phase 1B made /enter-code the canonical join
// experience. This route still validates the code (so previously
// distributed links, QR codes, and printed materials that pointed here
// keep working) but no longer renders its own join form; it hands off
// straight into the canonical flow, prefilled, so the user lands directly
// on the team-specific step instead of retyping the code.
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  const resolved = await resolveJoinCode(upperCode);
  const photo = entryPhotoForOffset(ENTRY_PHOTO_OFFSET.joinError);

  if (resolved.status === "archived") {
    return <ArchivedTeam photo={photo} />;
  }
  if (resolved.status === "invalid") {
    return <InvalidCode code={upperCode} photo={photo} />;
  }

  redirect(`/enter-code?code=${encodeURIComponent(upperCode)}`);
}

function cardStyle(): React.CSSProperties {
  return {
    position: "relative",
    zIndex: 2,
    width: "100%",
    maxWidth: 380,
    background: "#fff",
    borderRadius: 16,
    padding: "2.25rem 2rem",
    boxShadow: "0 24px 64px rgba(0,0,0,.35)",
    textAlign: "center",
  };
}

// Phase A36 — desktop-only background photography behind the card. Absent
// on mobile via JoinError.module.css's media query, matching every other
// entry surface's "photography is desktop-only" rule.
function BackgroundPhoto({ photo }: { photo: EntryPhoto }) {
  return (
    <div className={joinStyles.photoLayer}>
      <div className={entryStyles.photoFill}>
        <Image src={photo.src} alt={photo.alt} fill sizes="100vw" priority />
      </div>
      <div className={entryStyles.photoScrim} />
    </div>
  );
}

// Phase A36 brand-mark consistency pass — deliberately NOT swapped to the
// raster elf-team-logo.png like the other generic-branding CrownMark
// usages (AuthShell, EnterCodeView, TeamsView). This one renders inside
// the white error card (cardStyle(), desktop-only), and the logo asset's
// linework (white "ELF", orange "TEAM", yellow crown) has no light-
// background variant — "ELF" would render invisible on white. CrownMark
// + explicit dark-colored text is the correct, legible choice here.
function CardWordmark() {
  return (
    <div className={joinStyles.cardWordmark} style={{ justifyContent: "center", marginBottom: "1.5rem" }}>
      <CrownMark className={entryStyles.crown} />
      <span className={entryStyles.wordmarkText} style={{ color: "var(--shell-backdrop)" }}>
        ELF <b>TEAM</b>
      </span>
    </div>
  );
}

// Phase A36 mobile refinement — compact photo hero above the card, hidden
// at 1024px+ where the full-bleed BackgroundPhoto + CardWordmark (desktop's
// existing, unchanged composition) take over instead.
function MobileHero({ photo }: { photo: EntryPhoto }) {
  return (
    <div className={entryStyles.mobileHero}>
      <div className={entryStyles.photoFill}>
        <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 1023px) 100vw, 0px" priority />
      </div>
      <div className={entryStyles.photoScrim} />
      <div className={entryStyles.mobileHeroContent}>
        <Image
          src="/auth/elf-team-logo.png"
          alt="ELF Team"
          width={1536}
          height={1024}
          className={entryStyles.mobileHeroLogo}
          priority
        />
      </div>
    </div>
  );
}

function InvalidCode({ code, photo }: { code: string; photo: EntryPhoto }) {
  return (
    <div className={`${authDisplayFont.variable} ${joinStyles.shell}`}>
      <BackgroundPhoto photo={photo} />
      <MobileHero photo={photo} />
      <div className={joinStyles.cardArea}>
        <div style={cardStyle()}>
          <CardWordmark />
          <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>🔗</div>
          <h1 style={{ margin: "0 0 .5rem", fontFamily: "var(--auth-font-display, inherit)", fontSize: "1.3rem", fontWeight: 400, color: "#121110" }}>
            Invalid Join Code
          </h1>
          <p style={{ margin: 0, fontSize: ".875rem", color: "#6b7280", lineHeight: 1.5 }}>
            The code <strong style={{ color: "#374151" }}>{code}</strong> is not valid or has expired.
            Ask your coach for a new link.
          </p>
        </div>
      </div>
    </div>
  );
}

// Deliberately does not mention "archived" — that's an internal campaign
// state, not something a joining athlete/parent needs to know about.
function ArchivedTeam({ photo }: { photo: EntryPhoto }) {
  return (
    <div className={`${authDisplayFont.variable} ${joinStyles.shell}`}>
      <BackgroundPhoto photo={photo} />
      <MobileHero photo={photo} />
      <div className={joinStyles.cardArea}>
        <div style={cardStyle()}>
          <CardWordmark />
          <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>👋</div>
          <h1 style={{ margin: "0 0 .5rem", fontFamily: "var(--auth-font-display, inherit)", fontSize: "1.3rem", fontWeight: 400, color: "#121110" }}>
            Not Accepting New Members
          </h1>
          <p style={{ margin: 0, fontSize: ".875rem", color: "#6b7280", lineHeight: 1.5 }}>
            This team is no longer accepting new members. Ask your coach for more information.
          </p>
        </div>
      </div>
    </div>
  );
}
