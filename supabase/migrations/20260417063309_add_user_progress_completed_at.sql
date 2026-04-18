alter table public.user_progress
  add column if not exists completed_at timestamptz;

comment on column public.user_progress.completed_at
  is 'Timestamp when a user/module progress record was first or last marked completed.';;
