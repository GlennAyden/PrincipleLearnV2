-- Create transcript table required by transcript save + admin activity endpoints.

create table if not exists public.transcript (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  course_id uuid not null,
  subtopic_id uuid null,
  content text not null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transcript_user_id on public.transcript (user_id);
create index if not exists idx_transcript_course_id on public.transcript (course_id);
create index if not exists idx_transcript_subtopic_id on public.transcript (subtopic_id);
create index if not exists idx_transcript_created_at on public.transcript (created_at desc);
