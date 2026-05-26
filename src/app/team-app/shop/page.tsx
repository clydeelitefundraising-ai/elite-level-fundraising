"use client";

import { useAppStore } from "../../_store/AppStore";

const categories = ["All", "Tops", "Outerwear", "Bottoms", "Accessories"];

function ProductVisual({ color, name }: { color: string; name: string }) {
  const isDark = color !== "#F5F0EA" && color !== "#FFFFFF";
  return (
    <div
      style={{
        aspectRatio: "1 / 1",
        borderRadius: "16px 16px 0 0",
        background: color === "#F5F0EA" ? "#EDE8E0" : `${color}14`,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 10,
      }}
    >
      <div
        style={{
          width: 44, height: 44, borderRadius: "50%",
          background: color,
          boxShadow: isDark
            ? "0 4px 16px rgba(0,0,0,0.22), 0 0 0 3px rgba(255,255,255,0.25)"
            : "0 4px 16px rgba(0,0,0,0.1), 0 0 0 3px rgba(0,0,0,0.08)",
        }}
      />
      <p
        style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: isDark ? color : "#9CA3AF",
          opacity: 0.65,
        }}
      >
        {name.split(" ")[0]}
      </p>
    </div>
  );
}

export default function ShopPage() {
  const { products, teamInfo } = useAppStore();
  const featured = products[0];

  return (
    <div className="ta-page-enter">
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Header */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Team Shop
          </p>
          <p style={{ fontSize: 20, fontWeight: 800, color: "#0A0A0A", marginTop: 3 }}>
            {teamInfo.shortName} {teamInfo.mascot} Gear
          </p>
        </div>

        {/* Featured item banner */}
        {featured && (
          <div
            className="ta-pressable"
            style={{
              background: "linear-gradient(135deg, #0B1E3D, #1A3A5C)",
              borderRadius: 22, padding: "18px",
              boxShadow: "0 6px 28px rgba(11,30,61,0.25)",
              display: "flex", alignItems: "center", gap: 16, overflow: "hidden",
              position: "relative",
            }}
          >
            <div style={{
              position: "absolute", right: -30, top: -30,
              width: 120, height: 120, borderRadius: "50%",
              background: "rgba(201,168,76,0.12)", pointerEvents: "none",
            }} />

            <div
              style={{
                width: 68, height: 68, borderRadius: 16, flexShrink: 0,
                background: `${featured.swatchColor}22`,
                border: "1.5px solid rgba(201,168,76,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: featured.swatchColor === "#0B1E3D" ? "#C9A84C" : featured.swatchColor,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                }}
              />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 5,
                  background: "rgba(201,168,76,0.18)", color: "#C9A84C",
                  textTransform: "uppercase", letterSpacing: "0.07em",
                }}
              >
                Featured
              </span>
              <p style={{ fontSize: 17, fontWeight: 800, color: "#FFFFFF", marginTop: 5, lineHeight: 1.2 }}>
                {featured.name}
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                {featured.description}
              </p>
            </div>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ fontSize: 20, fontWeight: 900, color: "#C9A84C" }}>${featured.price}</p>
              <button
                style={{
                  marginTop: 6, padding: "6px 12px", borderRadius: 10,
                  background: "#C9A84C", border: "none", cursor: "pointer",
                  fontSize: 11, fontWeight: 700, color: "#0B1E3D",
                }}
              >
                View
              </button>
            </div>
          </div>
        )}

        {/* Category filter pills */}
        <div className="ta-no-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
          {categories.map((cat, i) => (
            <button
              key={cat}
              style={{
                flexShrink: 0, padding: "7px 14px", borderRadius: 100,
                background: i === 0 ? "#0B1E3D" : "#FFFFFF",
                color: i === 0 ? "#FFFFFF" : "#6B7280",
                fontSize: 12, fontWeight: 600,
                border: i === 0 ? "none" : "1.5px solid #E5E7EB",
                cursor: "pointer",
                boxShadow: i === 0 ? "0 2px 8px rgba(11,30,61,0.2)" : "none",
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product grid */}
        {products.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {products.map((product) => (
              <div
                key={product.id}
                className="ta-pressable"
                style={{
                  background: "#FFFFFF", borderRadius: 20,
                  boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
                  overflow: "hidden",
                }}
              >
                <ProductVisual color={product.swatchColor} name={product.name} />

                <div style={{ padding: "11px 12px 14px" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                    {product.category}
                  </p>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "#0A0A0A", lineHeight: 1.25, marginTop: 2 }}>
                    {product.name}
                  </p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3, lineHeight: 1.4 }}>
                    {product.description}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 900, color: "#0B1E3D" }}>
                      ${product.price}
                    </span>
                    {product.status === "coming_soon" ? (
                      <span
                        style={{
                          fontSize: 10, fontWeight: 600, padding: "4px 8px", borderRadius: 8,
                          background: "#F5F1EC", color: "#9CA3AF",
                        }}
                      >
                        Coming Soon
                      </span>
                    ) : (
                      <button
                        style={{
                          fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 9,
                          background: "#0B1E3D", color: "#FFFFFF", border: "none", cursor: "pointer",
                        }}
                      >
                        View Item
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🛍️</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#0A0A0A" }}>No items yet</p>
            <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 6 }}>
              Check back soon — new gear is on the way.
            </p>
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: 11, color: "#C4BEB6" }}>
          Full checkout coming soon &middot; Powered by Elite Level Fundraising
        </p>
      </div>
    </div>
  );
}
