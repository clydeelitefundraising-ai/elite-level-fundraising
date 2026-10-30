"use client";

import { useRef, useState, type FormEvent } from "react";
import { SubmitButton } from "./Button";

// Community Partner inquiry (/sponsors). Same endpoint, inbox, CRM
// conversion and business-email notification as the demo form
// (POST /api/marketing/demo-request with inquiryType "partner"); the
// server fixes the role and sends no email to the address typed here.
export function PartnerInquiryForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrors({});
    setFormError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      inquiryType: "partner",
      firstName: String(data.get("firstName") || ""),
      lastName: String(data.get("lastName") || ""),
      schoolName: String(data.get("businessName") || ""),
      sportProgram: String(data.get("teams") || ""),
      email: String(data.get("email") || ""),
      phone: String(data.get("phone") || ""),
      message: String(data.get("message") || ""),
      website: String(data.get("website") || ""), // honeypot
    };
    try {
      const res = await fetch("/api/marketing/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setStatus("success");
        form.reset();
      } else if (res.status === 400 && json.errors) {
        setErrors(json.errors);
        setStatus("error");
      } else {
        setFormError(json.error || "Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
      setStatus("error");
    } finally {
      requestAnimationFrame(() => statusRef.current?.focus());
    }
  }

  if (status === "success") {
    return (
      <div className="mk-form-status mk-status-success" role="status" tabIndex={-1} ref={statusRef}>
        <strong>Thanks — we received your inquiry.</strong> Someone from ELF will reach out to talk
        through monthly partnership options and the teams you&rsquo;d like to support.
      </div>
    );
  }

  const errorList = Object.values(errors);
  const field = (name: string, label: string, opts: { required?: boolean; type?: string; autoComplete?: string; placeholder?: string; key?: string } = {}) => {
    const errKey = opts.key ?? name;
    const id = `pi-${name}`;
    return (
      <div className="mk-field">
        <label htmlFor={id}>{label} {opts.required && <span className="mk-required">*</span>}</label>
        <input
          id={id}
          name={name}
          type={opts.type ?? "text"}
          required={opts.required}
          autoComplete={opts.autoComplete}
          placeholder={opts.placeholder}
          aria-invalid={Boolean(errors[errKey])}
          aria-describedby={errors[errKey] ? `${id}-error` : undefined}
        />
        {errors[errKey] && <span className="mk-field-error" id={`${id}-error`}>{errors[errKey]}</span>}
      </div>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-describedby={formError || errorList.length ? "pi-error-summary" : undefined}>
      {(formError || errorList.length > 0) && (
        <div className="mk-form-status mk-status-error" id="pi-error-summary" role="alert" tabIndex={-1} ref={statusRef}>
          <strong>{formError ? formError : "Please fix the following:"}</strong>
          {errorList.length > 0 && (
            <ul>{errorList.map((msg, i) => <li key={i}>{msg}</li>)}</ul>
          )}
        </div>
      )}

      <div className="mk-honeypot" aria-hidden="true">
        <label htmlFor="pi-website">Leave this field blank</label>
        <input type="text" id="pi-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mk-form-grid">
        {field("businessName", "Business name", { required: true, autoComplete: "organization", key: "schoolName" })}
        {field("teams", "School or team you'd like to support", { placeholder: "e.g. Sunridge Valley football" })}
        {field("firstName", "First name", { required: true, autoComplete: "given-name" })}
        {field("lastName", "Last name", { required: true, autoComplete: "family-name" })}
        {field("email", "Email address", { required: true, type: "email", autoComplete: "email" })}
        {field("phone", "Phone (optional)", { type: "tel", autoComplete: "tel" })}
        <div className="mk-field mk-field-full">
          <label htmlFor="pi-message">Anything else we should know?</label>
          <textarea id="pi-message" name="message" rows={4} placeholder="Your website, what you'd like families to know about your business, or questions about partnering." />
        </div>
      </div>

      <p className="mk-form-note">
        By submitting, you agree to be contacted by Elite Level Fundraising LLC about Community
        Partnerships. See our <a href="/trust/privacy">Privacy Policy</a> for how your information is used.
      </p>

      <SubmitButton size="lg" block disabled={status === "submitting"} style={{ marginTop: "var(--mk-space-6)" }}>
        {status === "submitting" ? "Sending…" : "Contact ELF About Partnering"}
      </SubmitButton>
    </form>
  );
}
