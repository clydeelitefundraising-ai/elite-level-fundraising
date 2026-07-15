-- Phase A20 — Marketing site demo request capture.
-- Fully isolated from Team App tables: no foreign keys in or out of this table.
-- Written for the public marketing site's "Book a Demo" form.

create table if not exists marketing_demo_requests (
  id             uuid primary key default gen_random_uuid(),
  first_name     text not null,
  last_name      text not null,
  school_name    text not null,
  sport_program  text,
  email          text not null,
  role           text not null,
  message        text,
  status         text not null default 'new', -- new | contacted | scheduled | closed
  ip             text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index if not exists marketing_demo_requests_created_at_idx
  on marketing_demo_requests (created_at desc);
