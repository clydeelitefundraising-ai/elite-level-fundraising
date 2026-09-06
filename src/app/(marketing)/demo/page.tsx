import type { Metadata } from "next";
import { DemoRequestForm } from "@/components/marketing/DemoRequestForm";

export const metadata: Metadata = {
  title: "Book a Demo | Elite Level Fundraising",
  description:
    "See Elite Level Fundraising in action. No commitment — a 20-minute walkthrough built around your program.",
  alternates: { canonical: "/demo" },
};

export default function DemoPage() {
  return (
    <>
      <div className="mk-page-hero">
        <div className="mk-container-narrow">
          <span className="mk-eyebrow">Get started</span>
          <h1>Book a Demo</h1>
          <p>
            No commitment, about 20 minutes. We&rsquo;ll show you what your team&rsquo;s page and hub
            would look like and answer every question.
          </p>
        </div>
      </div>
      <div className="mk-section">
        <div className="mk-container-narrow">
          <DemoRequestForm />
        </div>
      </div>
    </>
  );
}
