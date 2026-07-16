"use client";

import { useRef, useState, type FormEvent } from "react";
import { SubmitButton } from "./Button";

interface FieldErrors {
  [key: string]: string;
}

const ROLES = [
  "Athletic Director",
  "Head Coach",
  "Assistant Coach",
  "Booster Club Member",
  "Parent / Guardian",
  "Other",
];

export function DemoRequestForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errors, setErrors] = useState<FieldErrors>({});
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
      firstName: String(data.get("firstName") || ""),
      lastName: String(data.get("lastName") || ""),
      schoolName: String(data.get("schoolName") || ""),
      sportProgram: String(data.get("sportProgram") || ""),
      email: String(data.get("email") || ""),
      role: String(data.get("role") || ""),
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
      // Move focus to the status message so screen reader users hear the outcome.
      requestAnimationFrame(() => statusRef.current?.focus());
    }
  }

  if (status === "success") {
    return (
      <div className="mk-form-status mk-status-success" role="status" tabIndex={-1} ref={statusRef}>
        <strong>Request received.</strong> We&rsquo;ll follow up shortly to schedule your walkthrough. A confirmation email is on its way to you.
      </div>
    );
  }

  const errorList = Object.values(errors);

  return (
    <form onSubmit={onSubmit} noValidate aria-describedby={formError || errorList.length ? "mk-form-error-summary" : undefined}>
      {(formError || errorList.length > 0) && (
        <div className="mk-form-status mk-status-error" id="mk-form-error-summary" role="alert" tabIndex={-1} ref={statusRef}>
          <strong>{formError ? formError : "Please fix the following:"}</strong>
          {errorList.length > 0 && (
            <ul>
              {errorList.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Honeypot — hidden from sighted and screen-reader users; bots that
          auto-fill every field will trip it. */}
      <div className="mk-honeypot" aria-hidden="true">
        <label htmlFor="website">Leave this field blank</label>
        <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mk-form-grid">
        <div className="mk-field">
          <label htmlFor="firstName">First name <span className="mk-required">*</span></label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            required
            autoComplete="given-name"
            aria-invalid={Boolean(errors.firstName)}
            aria-describedby={errors.firstName ? "firstName-error" : undefined}
          />
          {errors.firstName && <span className="mk-field-error" id="firstName-error">{errors.firstName}</span>}
        </div>

        <div className="mk-field">
          <label htmlFor="lastName">Last name <span className="mk-required">*</span></label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            required
            autoComplete="family-name"
            aria-invalid={Boolean(errors.lastName)}
            aria-describedby={errors.lastName ? "lastName-error" : undefined}
          />
          {errors.lastName && <span className="mk-field-error" id="lastName-error">{errors.lastName}</span>}
        </div>

        <div className="mk-field">
          <label htmlFor="schoolName">School / organization <span className="mk-required">*</span></label>
          <input
            id="schoolName"
            name="schoolName"
            type="text"
            required
            aria-invalid={Boolean(errors.schoolName)}
            aria-describedby={errors.schoolName ? "schoolName-error" : undefined}
          />
          {errors.schoolName && <span className="mk-field-error" id="schoolName-error">{errors.schoolName}</span>}
        </div>

        <div className="mk-field">
          <label htmlFor="sportProgram">Sport / program</label>
          <input id="sportProgram" name="sportProgram" type="text" placeholder="e.g. Varsity Football" />
        </div>

        <div className="mk-field">
          <label htmlFor="email">Email address <span className="mk-required">*</span></label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && <span className="mk-field-error" id="email-error">{errors.email}</span>}
        </div>

        <div className="mk-field">
          <label htmlFor="role">Your role <span className="mk-required">*</span></label>
          <select
            id="role"
            name="role"
            required
            defaultValue=""
            aria-invalid={Boolean(errors.role)}
            aria-describedby={errors.role ? "role-error" : undefined}
          >
            <option value="" disabled>Select your role</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {errors.role && <span className="mk-field-error" id="role-error">{errors.role}</span>}
        </div>

        <div className="mk-field mk-field-full">
          <label htmlFor="message">Tell us about your program</label>
          <textarea id="message" name="message" rows={4} placeholder="What are your biggest fundraising or communication challenges this season?" />
        </div>
      </div>

      <p className="mk-form-note">
        By submitting, you agree to be contacted by Elite Level Fundraising LLC. See our{" "}
        <a href="/trust/privacy">Privacy Policy</a> for how your information is used.
      </p>

      <SubmitButton size="lg" block disabled={status === "submitting"} style={{ marginTop: "var(--mk-space-6)" }}>
        {status === "submitting" ? "Sending…" : "Request My Free Demo"}
      </SubmitButton>
    </form>
  );
}
