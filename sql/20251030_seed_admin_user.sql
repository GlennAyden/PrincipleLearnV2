-- Seed or promote a default admin account for testing the monitoring dashboard.
-- Update the email/password hash as needed before running in production.

insert into users (id, email, password_hash, name, role, created_at, updated_at)
values (
    gen_random_uuid(),
    'admin@principlelearn.com',
    '$2b$10$2Oq/Vyg44XaDyrJuiKTnqueiClDq/Y9FkmCNnaI98FTbJ1klygaIa', -- bcrypt hash for "Admin123!"
    'Platform Admin',
    'ADMIN',
    now(),
    now()
)
on conflict (email) do update
set
    role = 'ADMIN',
    name = excluded.name,
    password_hash = excluded.password_hash,
    updated_at = now();
