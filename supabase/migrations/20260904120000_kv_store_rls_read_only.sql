-- MOTM: begræns kv_store til læsning for anon/authenticated.
-- Writes skal ske via server (SUPABASE_SERVICE_ROLE_KEY), som bypasser RLS.
--
-- Kør denne SQL i Supabase Dashboard → SQL Editor (staging først),
-- ELLER via CLI mod jeres projekt – før I fjerner klient-writes i produktion.

alter table if exists public.kv_store enable row level security;

-- Fjern evt. gamle åbne write-policies (navne kan variere – tilpas efter list_policies).
drop policy if exists "Enable read access for all users" on public.kv_store;
drop policy if exists "Enable insert for all users" on public.kv_store;
drop policy if exists "Enable update for all users" on public.kv_store;
drop policy if exists "Enable delete for all users" on public.kv_store;
drop policy if exists "kv_store_all_anon" on public.kv_store;
drop policy if exists "kv_store_select_public" on public.kv_store;
drop policy if exists "kv_store_insert_public" on public.kv_store;
drop policy if exists "kv_store_update_public" on public.kv_store;
drop policy if exists "kv_store_delete_public" on public.kv_store;

-- Offentlig læsning (app + Realtime)
drop policy if exists "kv_store_select_anon" on public.kv_store;
create policy "kv_store_select_anon"
  on public.kv_store
  for select
  to anon, authenticated
  using (true);

-- Ingen insert/update/delete for anon/authenticated.
-- service_role bypasser RLS og bruges kun fra /api/*.

revoke insert, update, delete on public.kv_store from anon, authenticated;
grant select on public.kv_store to anon, authenticated;
