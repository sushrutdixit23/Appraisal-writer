"use client";

// Sentinel — section layout. Dark #111111 brand rail on the left
// (Zyntask parent brand + Sentinel product name + section nav), sandstone
// canvas on the right. Scoped to /sentinel/* only — nothing here leaks
// into the rest of the site's visual identity.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SANS, SERIF, T } from "./lib/theme";

const NAV = [
  { href: "/sentinel", label: "Review Queue" },
  { href: "/sentinel/analysis", label: "Deep Analysis" },
  { href: "/sentinel/executive", label: "Executive Dashboard" },
];

export default function SentinelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: T.background,
        fontFamily: SANS,
        color: T.ink,
      }}
    >
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap");
      `}</style>

      {/* Dark brand rail */}
      <aside
        style={{
          width: 232,
          flexShrink: 0,
          background: T.sidebar,
          padding: "1.6rem 1.2rem",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            paddingBottom: "1rem",
            borderBottom: "1px solid rgba(237,231,220,0.16)",
            marginBottom: "1rem",
          }}
        >
          <Link href="/" style={{ textDecoration: "none" }}>
            <p
              style={{
                fontSize: "0.62rem",
                fontWeight: 500,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: T.sidebarTextMuted,
                margin: "0 0 0.15rem 0",
              }}
            >
              Zyntask
            </p>
          </Link>
          <p
            style={{
              fontFamily: SERIF,
              fontSize: "1.35rem",
              fontWeight: 500,
              color: T.sidebarText,
              margin: 0,
            }}
          >
            Sentinel
          </p>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  textDecoration: "none",
                  fontSize: "0.86rem",
                  fontWeight: active ? 600 : 400,
                  color: active ? T.sidebarText : T.sidebarTextMuted,
                  padding: "0.55rem 0.7rem",
                  background: active ? "rgba(164,117,81,0.22)" : "transparent",
                  borderLeft: active
                    ? `2px solid ${T.accent}`
                    : "2px solid transparent",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <p
          style={{
            marginTop: "auto",
            fontSize: "0.68rem",
            lineHeight: 1.5,
            color: T.sidebarTextMuted,
          }}
        >
          AI-drafted, human-approved.
          <br />
          Nothing is final without sign-off.
        </p>
      </aside>

      {/* Content canvas */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          justifyContent: "center",
          padding: "2.2rem 2.8rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: 1080 }}>{children}</div>
      </main>
    </div>
  );
}
