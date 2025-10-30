-- Migration: Add API logging and discussion admin action tables
-- Run this script against the Supabase database prior to deploying the monitoring features.

create table if not exists api_logs (
    id uuid primary key default gen_random_uuid(),
    method varchar(16),
    path text,
    query text,
    status_code integer,
    duration_ms integer,
    ip_address varchar(64),
    user_agent text,
    user_id text,
    user_email text,
    user_role text,
    label text,
    metadata jsonb,
    error_message text,
    created_at timestamp with time zone default now()
);

create index if not exists idx_api_logs_created_at on api_logs(created_at);
create index if not exists idx_api_logs_path on api_logs(path);

alter table api_logs enable row level security;

create table if not exists discussion_admin_actions (
    id uuid primary key default gen_random_uuid(),
    session_id uuid references discussion_sessions(id) on delete cascade,
    admin_id text,
    admin_email text,
    action varchar(50),
    payload jsonb,
    created_at timestamp with time zone default now()
);

create index if not exists idx_discussion_admin_actions_session on discussion_admin_actions(session_id);

alter table discussion_admin_actions enable row level security;
