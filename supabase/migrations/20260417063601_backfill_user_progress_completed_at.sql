update public.user_progress
set completed_at = coalesce(completed_at, updated_at, created_at)
where is_completed = true
  and completed_at is null;

update public.user_progress
set completed_at = null
where is_completed = false
  and completed_at is not null;;
