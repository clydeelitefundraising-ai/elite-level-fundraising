"use client";

import { useState } from "react";
import type { TeamAthleteRow } from "@/lib/teamData";
import { isStaff, isHeadCoach, type TeamActor } from "@/lib/permissions";

// D3: the athlete list state, Add/Edit modal state, and every CRUD/photo
// handler previously owned directly inside TeamView.tsx (verbatim logic,
// only relocated) — extracted into a hook so BOTH the existing mobile
// grid (AthleteRosterGrid.tsx, TeamView's old body) and the new desktop
// roster table can share ONE authoritative athlete-management workflow
// instead of two independent copies. There is no behavior change here:
// every field/function name, every request shape, and every state
// transition is identical to what TeamView.tsx did inline before D3.

export type AthForm = {
  name: string;
  event: string;
  class_year: string;
  jersey_number: string;
  grad_year: string;
  goal_cents: string;   // stored as dollars in UI
  profile_photo: string;
  contact_phone: string;
  contact_email: string;
};

export const BLANK_ATHLETE_FORM: AthForm = {
  name: "", event: "", class_year: "", jersey_number: "", grad_year: "", goal_cents: "", profile_photo: "",
  contact_phone: "", contact_email: "",
};

export function athleteFormFromRow(a: TeamAthleteRow): AthForm {
  return {
    name:          a.name,
    event:         a.event ?? "",
    class_year:    a.class_year ?? "",
    jersey_number: a.jersey_number != null ? String(a.jersey_number) : "",
    grad_year:     a.grad_year     != null ? String(a.grad_year)     : "",
    goal_cents:    a.goal_cents    != null ? String(a.goal_cents / 100) : "",
    profile_photo: a.profile_photo ?? "",
    contact_phone: a.contact_phone ?? "",
    contact_email: a.contact_email ?? "",
  };
}

export function useAthleteRoster(slug: string, initialAthletes: TeamAthleteRow[], actor: TeamActor) {
  const staffMode = isStaff(actor);
  const canDelete = isHeadCoach(actor);
  const [athletes,       setAthletes]       = useState<TeamAthleteRow[]>(initialAthletes);
  const [form,           setForm]           = useState<AthForm>(BLANK_ATHLETE_FORM);
  const [editing,        setEditing]        = useState<TeamAthleteRow | null>(null);
  const [showAdd,        setShowAdd]        = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState("");
  const [photoPreview,   setPhotoPreview]   = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError,     setPhotoError]     = useState("");

  const resetPhoto = () => { setPhotoPreview(""); setPhotoError(""); setPhotoUploading(false); };

  const openAdd = () => {
    setForm(BLANK_ATHLETE_FORM); setError(""); resetPhoto(); setShowAdd(true);
  };

  const openEdit = (a: TeamAthleteRow) => {
    setForm(athleteFormFromRow(a)); setError("");
    setPhotoPreview(a.profile_photo ?? ""); setPhotoError(""); setPhotoUploading(false);
    setEditing(a);
  };

  const closeModal = () => { setShowAdd(false); setEditing(null); setError(""); resetPhoto(); };

  const handlePhotoUpload = async (file: File) => {
    setPhotoUploading(true);
    setPhotoError("");
    const localPreview = URL.createObjectURL(file);
    setPhotoPreview(localPreview);

    const fd = new FormData();
    fd.append("photo", file);
    const res = await fetch(`/api/team/${slug}/roster/photo`, { method: "POST", body: fd });
    const data = await res.json();

    URL.revokeObjectURL(localPreview);
    setPhotoUploading(false);

    if (!res.ok) {
      setPhotoError(data.error ?? "Upload failed");
      setPhotoPreview(form.profile_photo);
      return;
    }

    setPhotoPreview(data.url);
    setForm(f => ({ ...f, profile_photo: data.url }));
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.class_year.trim()) { setError("Name and class are required."); return; }
    setSaving(true); setError("");
    const res = await fetch(`/api/team/${slug}/roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:          form.name.trim(),
        event:         form.event.trim(),
        class_year:    form.class_year || null,
        jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
        grad_year:     form.grad_year     ? parseInt(form.grad_year)     : null,
        goal_cents:    form.goal_cents    ? Math.round(parseFloat(form.goal_cents) * 100) : null,
        profile_photo: form.profile_photo || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to add athlete."); return; }
    setAthletes(prev => [...prev, data]);
    closeModal();
  };

  const handleEdit = async () => {
    if (!editing || !form.name.trim() || !form.class_year.trim()) { setError("Name and class are required."); return; }
    setSaving(true); setError("");
    const res = await fetch(`/api/team/${slug}/roster/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:          form.name.trim(),
        event:         form.event.trim(),
        class_year:    form.class_year || null,
        jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
        grad_year:     form.grad_year     ? parseInt(form.grad_year)     : null,
        goal_cents:    form.goal_cents    ? Math.round(parseFloat(form.goal_cents) * 100) : null,
        profile_photo: form.profile_photo || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to update athlete."); return; }
    setAthletes(prev => prev.map(a =>
      a.id === editing.id
        ? {
            ...a,
            name:          form.name.trim(),
            event:         form.event.trim(),
            class_year:    form.class_year || null,
            jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
            grad_year:     form.grad_year     ? parseInt(form.grad_year)     : null,
            goal_cents:    form.goal_cents    ? Math.round(parseFloat(form.goal_cents) * 100) : null,
            profile_photo: form.profile_photo || null,
            contact_phone: form.contact_phone.trim() || null,
            contact_email: form.contact_email.trim() || null,
          }
        : a
    ));
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this athlete from the team?")) return;
    const res = await fetch(`/api/team/${slug}/roster/${id}`, { method: "DELETE" });
    if (res.ok) setAthletes(prev => prev.filter(a => a.id !== id));
  };

  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;

  return {
    staffMode, canDelete,
    athletes, form, editing, showAdd, saving, error,
    photoPreview, photoUploading, photoError,
    isEditing, modalOpen,
    openAdd, openEdit, closeModal, handlePhotoUpload, handleAdd, handleEdit, handleDelete,
    setForm,
  };
}

export type AthleteRosterState = ReturnType<typeof useAthleteRoster>;
