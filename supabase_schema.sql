-- =============================================
-- Polla Gorettiana — Supabase Schema
-- Run this in the Supabase SQL editor
-- =============================================

-- 1. Crear schema propio (aislado del resto del proyecto)
create schema if not exists polla;

-- 2. Exponer el schema a la API de Supabase
--    También ir a: Settings → API → Extra schemas → agregar "polla"
grant usage on schema polla to anon, authenticated, service_role;
alter default privileges in schema polla grant all on tables to anon, authenticated, service_role;
alter default privileges in schema polla grant all on sequences to anon, authenticated, service_role;

-- ── Tablas ──────────────────────────────────────────────

create table if not exists polla.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  total_points int default 0,
  created_at timestamptz default now()
);

create table if not exists polla.matches (
  id uuid primary key default gen_random_uuid(),
  match_key text unique not null,
  phase text not null,
  home_team text not null,
  away_team text not null,
  match_order int default 0,       -- posición en el Excel, para ordenar
  home_score int,
  away_score int,
  status text default 'scheduled',
  match_date timestamptz,
  api_match_id text,
  created_at timestamptz default now()
);

-- Si ya creaste la tabla sin match_order, ejecutá esto:
-- alter table polla.matches add column if not exists match_order int default 0;

create table if not exists polla.predictions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references polla.participants(id) on delete cascade,
  match_id uuid references polla.matches(id) on delete cascade,
  predicted_home int not null,
  predicted_away int not null,
  points_earned int default 0,
  unique(participant_id, match_id)
);

-- ── Índices ─────────────────────────────────────────────

create index if not exists idx_predictions_participant on polla.predictions(participant_id);
create index if not exists idx_predictions_match on polla.predictions(match_id);
create index if not exists idx_matches_status on polla.matches(status);
create index if not exists idx_matches_key on polla.matches(match_key);

-- ── Row Level Security ──────────────────────────────────

alter table polla.participants enable row level security;
alter table polla.matches enable row level security;
alter table polla.predictions enable row level security;

-- Lectura pública
create policy "Public read participants" on polla.participants for select using (true);
create policy "Public read matches"      on polla.matches      for select using (true);
create policy "Public read predictions"  on polla.predictions  for select using (true);

-- Escritura via anon key (panel admin)
create policy "Anon insert participants" on polla.participants for insert with check (true);
create policy "Anon update participants" on polla.participants for update using (true);
create policy "Anon insert matches"      on polla.matches      for insert with check (true);
create policy "Anon update matches"      on polla.matches      for update using (true);
create policy "Anon insert predictions"  on polla.predictions  for insert with check (true);
create policy "Anon update predictions"  on polla.predictions  for update using (true);
create policy "Anon delete predictions"  on polla.predictions  for delete using (true);

-- ── Realtime ────────────────────────────────────────────

alter publication supabase_realtime add table polla.participants;
alter publication supabase_realtime add table polla.matches;
