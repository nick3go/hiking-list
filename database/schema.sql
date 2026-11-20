-- Shared, deliberately login-free hiking list. Keep hikes_private out of
-- Supabase's exposed schemas. Only the bounded RPC below is exposed.
create schema hikes_private;
revoke all on schema hikes_private from public;
grant usage on schema hikes_private to anon, authenticated;

create table hikes_private.hikes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  country text check (country ~ '^[A-Z]{2}$'),
  difficulty text check (difficulty in ('easy','medium','hard')),
  reel_url text check (char_length(reel_url) <= 2048 and reel_url ~ '^https?://'),
  hribi_url text check (char_length(hribi_url) <= 2048 and hribi_url ~ '^https?://'),
  notes text check (char_length(notes) <= 5000),
  strava_url text check (char_length(strava_url) <= 2048 and strava_url ~* '^https://((www\.)?strava\.com/activities/[0-9]+([/?#].*)?|strava\.app\.link/[A-Za-z0-9_-]+([/?#].*)?)$'),
  completed boolean not null default false,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  check (not completed or strava_url is not null)
);
alter table hikes_private.hikes enable row level security;
-- Anyone with the website can collaborate, as requested. These policies are
-- intentionally shared; there are no accounts and no claim of user privacy.
create policy shared_read on hikes_private.hikes for select to anon, authenticated using (true);
create policy shared_add on hikes_private.hikes for insert to anon, authenticated with check (true);
create policy shared_edit on hikes_private.hikes for update to anon, authenticated using (true) with check (true);
grant select, insert, update on hikes_private.hikes to anon, authenticated;
revoke delete, truncate, references, trigger on hikes_private.hikes from anon, authenticated;

create function public.hikes_api(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  r hikes_private.hikes;
begin
  if p_action = 'list' then
    return (select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc, h.id), '[]'::jsonb)
      from hikes_private.hikes h where h.deleted_at is null);
  elsif p_action = 'create' then
    insert into hikes_private.hikes(title,country,difficulty,reel_url,hribi_url,notes)
    values (btrim(p_data->>'title'), nullif(p_data->>'country',''),
      nullif(p_data->>'difficulty',''),nullif(p_data->>'reel_url',''),
      nullif(p_data->>'hribi_url',''),nullif(btrim(p_data->>'notes'),'')) returning * into r;
  elsif p_action = 'update' then
    update hikes_private.hikes set title=btrim(p_data->>'title'),
      country=nullif(p_data->>'country',''),difficulty=nullif(p_data->>'difficulty',''),
      reel_url=nullif(p_data->>'reel_url',''),hribi_url=nullif(p_data->>'hribi_url',''),
      notes=nullif(btrim(p_data->>'notes'),''),
      strava_url=case when completed then nullif(p_data->>'strava_url','') else strava_url end,
      version=version+1
    where id=(p_data->>'id')::uuid and version=(p_data->>'version')::integer and deleted_at is null returning * into r;
  elsif p_action = 'complete' then
    update hikes_private.hikes set completed=true,strava_url=nullif(p_data->>'strava_url',''),version=version+1
    where id=(p_data->>'id')::uuid and version=(p_data->>'version')::integer and deleted_at is null and not completed returning * into r;
  elsif p_action = 'reopen' then
    update hikes_private.hikes set completed=false,strava_url=null,version=version+1
    where id=(p_data->>'id')::uuid and version=(p_data->>'version')::integer and deleted_at is null and completed returning * into r;
  elsif p_action = 'delete' then
    update hikes_private.hikes set deleted_at=now(),version=version+1
    where id=(p_data->>'id')::uuid and version=(p_data->>'version')::integer and deleted_at is null returning * into r;
  elsif p_action = 'undelete' then
    update hikes_private.hikes set deleted_at=null,version=version+1
    where id=(p_data->>'id')::uuid and version=(p_data->>'version')::integer and deleted_at is not null returning * into r;
  else
    raise exception 'Unknown action' using errcode='22023';
  end if;
  if r.id is null then
    raise exception 'CONFLICT: Hike changed or no longer exists. Refresh the list.' using errcode='40001';
  end if;
  return to_jsonb(r);
end;
$$;
revoke all on function public.hikes_api(text,jsonb) from public;
grant execute on function public.hikes_api(text,jsonb) to anon, authenticated;
comment on function public.hikes_api(text,jsonb) is 'Deliberately login-free shared hike list. Invoker privileges; private unexposed schema; no service key.';
notify pgrst, 'reload schema';
