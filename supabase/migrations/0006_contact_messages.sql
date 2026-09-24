-- Contact form messages (/contact).
--
-- Run this in the Supabase SQL Editor (paste the contents of this file, not
-- its path).
--
-- Each message is also emailed to Ethan when RESEND_API_KEY is set; this
-- table is the copy that can't get lost in a spam folder. Read them in
-- Supabase under Table Editor → contact_messages.

create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null check (char_length(name) between 1 and 80),
  email      text not null check (char_length(email) between 3 and 200),
  category   text not null check (category in ('bug', 'question', 'opportunity', 'other')),
  message    text not null check (char_length(message) between 1 and 5000),
  -- Set when the sender was signed in, so a bug report can be matched to
  -- the account it happened on.
  user_id    uuid references auth.users (id) on delete set null,
  emailed    boolean not null default false
);

-- RLS on with no policies at all: nobody can read or write this table with
-- the public key. The contact API writes with the secret key, after its own
-- validation and rate limiting, so the form can't be bypassed to flood it.
alter table public.contact_messages enable row level security;
