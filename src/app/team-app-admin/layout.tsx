import type { Metadata } from "next";
import "./admin.css";
import AdminSidebar from "./_components/AdminSidebar";

export const metadata: Metadata = {
  title: "Team App Admin | Elite Level Fundraising",
  description: "Admin panel for managing the Team App Portal content.",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#F4F6F8",
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        WebkitFontSmoothing: "antialiased",
      } as React.CSSProperties}
    >
      <AdminSidebar />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}
