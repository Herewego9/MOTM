-- MOTM fase 1: relationelt multi-tenant fundament
-- Kør på STAGING først. Påvirker ikke eksisterende kv_store-data.
-- Default app-path forbliver blob indtil DATA_BACKEND=relational.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Clubs
-- ---------------------------------------------------------------------------
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  invite_code text unique,
  dbu_pool_id text not null default '',
  dbu_team_id text not null default '',
  competition text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clubs_slug_idx on public.clubs (slug);

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  label text not null,
  is_current boolean not null default false,
  archived_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists seasons_one_current_per_club
  on public.seasons (club_id)
  where is_current = true;

create index if not exists seasons_club_idx on public.seasons (club_id);

-- ---------------------------------------------------------------------------
-- Players (squad)
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  display_name text not null,
  name_key text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (club_id, name_key)
);

create index if not exists players_club_active_idx
  on public.players (club_id)
  where active = true;

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete set null,
  external_id text not null,
  home_name text not null default '',
  away_name text not null default '',
  kickoff_at timestamptz,
  competition text,
  voting_status text not null default 'closed'
    check (voting_status in ('closed', 'open', 'revealed')),
  motm_player_id uuid references public.players(id) on delete set null,
  motm_name text,
  sort_index int not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, external_id)
);

create index if not exists matches_club_status_idx
  on public.matches (club_id, voting_status);

create index if not exists matches_season_idx on public.matches (season_id);

-- ---------------------------------------------------------------------------
-- Votes (atomare, unikke pr. voter+kamp)
-- count > 1 bruges kun til legacy-migrering af historiske aggregates.
-- ---------------------------------------------------------------------------
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  voter_key text not null,
  display_name_snapshot text not null,
  count int not null default 1 check (count > 0),
  created_at timestamptz not null default now(),
  unique (match_id, voter_key)
);

create index if not exists votes_match_idx on public.votes (match_id);
create index if not exists votes_club_match_idx on public.votes (club_id, match_id);

-- ---------------------------------------------------------------------------
-- Match player stats (mål/assist/kort)
-- ---------------------------------------------------------------------------
create table if not exists public.match_player_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  display_name text not null,
  goals int not null default 0,
  assists int not null default 0,
  yellow_cards int not null default 0,
  red_cards int not null default 0,
  unique (match_id, player_id)
);

-- ---------------------------------------------------------------------------
-- Laundry assignments
-- ---------------------------------------------------------------------------
create table if not exists public.laundry_assignments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  player_name text not null,
  match_label text,
  assigned_at timestamptz not null default now(),
  external_ref text
);

create index if not exists laundry_club_idx
  on public.laundry_assignments (club_id, assigned_at desc);

-- ---------------------------------------------------------------------------
-- RLS: ingen anon/authenticated writes. Læsning via service role / senere scoped policies.
-- Fase 1: web spejler stadig DTO til kv_store for Realtime-kompatibilitet.
-- ---------------------------------------------------------------------------
alter table public.clubs enable row level security;
alter table public.seasons enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.votes enable row level security;
alter table public.match_player_stats enable row level security;
alter table public.laundry_assignments enable row level security;

-- Ingen policies for anon/authenticated = ingen direkte adgang.
revoke all on public.clubs from anon, authenticated;
revoke all on public.seasons from anon, authenticated;
revoke all on public.players from anon, authenticated;
revoke all on public.matches from anon, authenticated;
revoke all on public.votes from anon, authenticated;
revoke all on public.match_player_stats from anon, authenticated;
revoke all on public.laundry_assignments from anon, authenticated;

grant all on public.clubs to service_role;
grant all on public.seasons to service_role;
grant all on public.players to service_role;
grant all on public.matches to service_role;
grant all on public.votes to service_role;
grant all on public.match_player_stats to service_role;
grant all on public.laundry_assignments to service_role;

-- ---------------------------------------------------------------------------
-- RPC: cast_vote — atomar stemme
-- ---------------------------------------------------------------------------
create or replace function public.cast_vote(
  p_club_slug text,
  p_match_external_id text,
  p_voter_key text,
  p_player_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club public.clubs%rowtype;
  v_match public.matches%rowtype;
  v_player public.players%rowtype;
  v_name text;
  v_key text;
  v_inserted boolean := false;
begin
  v_name := trim(p_player_name);
  if p_club_slug is null or length(trim(p_club_slug)) = 0 then
    raise exception 'club_slug mangler' using errcode = '22023';
  end if;
  if p_match_external_id is null or length(trim(p_match_external_id)) = 0 then
    raise exception 'match_external_id mangler' using errcode = '22023';
  end if;
  if p_voter_key is null or length(trim(p_voter_key)) = 0 then
    raise exception 'voter_key mangler' using errcode = '22023';
  end if;
  if v_name is null or length(v_name) = 0 or length(v_name) > 80 then
    raise exception 'ugyldigt spillernavn' using errcode = '22023';
  end if;

  v_key := lower(v_name);

  select * into v_club from public.clubs where slug = trim(p_club_slug);
  if not found then
    raise exception 'klub findes ikke' using errcode = 'P0002';
  end if;

  select * into v_match
  from public.matches
  where club_id = v_club.id and external_id = trim(p_match_external_id);
  if not found then
    raise exception 'kamp findes ikke' using errcode = 'P0002';
  end if;

  if v_match.voting_status is distinct from 'open' then
    raise exception 'afstemningen er ikke åben' using errcode = 'P0001';
  end if;

  insert into public.players (club_id, display_name, name_key, active)
  values (v_club.id, v_name, v_key, true)
  on conflict (club_id, name_key) do update
    set display_name = excluded.display_name,
        active = true
  returning * into v_player;

  with ins as (
    insert into public.votes (
      club_id, match_id, player_id, voter_key, display_name_snapshot, count
    ) values (
      v_club.id, v_match.id, v_player.id, trim(p_voter_key), v_name, 1
    )
    on conflict (match_id, voter_key) do nothing
    returning id
  )
  select exists(select 1 from ins) into v_inserted;

  -- Opdater MOTM-preview mens afstemning er åben
  update public.matches m
  set
    motm_player_id = sub.player_id,
    motm_name = sub.display_name,
    updated_at = now()
  from (
    select
      v.player_id,
      max(v.display_name_snapshot) as display_name,
      sum(v.count) as total
    from public.votes v
    where v.match_id = v_match.id
    group by v.player_id
    order by sum(v.count) desc, max(v.display_name_snapshot) asc
    limit 1
  ) sub
  where m.id = v_match.id;

  return jsonb_build_object(
    'accepted', v_inserted,
    'clubId', v_club.id,
    'matchId', v_match.id,
    'playerId', v_player.id,
    'alreadyVoted', not v_inserted
  );
end;
$$;

revoke all on function public.cast_vote(text, text, text, text) from public, anon, authenticated;
grant execute on function public.cast_vote(text, text, text, text) to service_role;

comment on function public.cast_vote is
  'Atomar MOTM-stemme. Unik pr. (match_id, voter_key). Kun service_role.';
