import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elite Level Fundraising | Arizona School Sports Teams",
  description:
    "We help Arizona school sports teams raise more money with simple donation pages, corporate sponsor outreach, and custom team merchandise shops.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
