-- ============================================================
--  Birthday RSVP — run this whole file in the Supabase SQL editor
-- ============================================================

-- ---------- tables ----------

create table bring_items (
  id    text primary key,
  label text not null,
  quota int,                        -- null = unlimited
  sort  int  not null default 0
);

create table rsvps (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  attending  boolean not null,
  note       text default '',
  created_at timestamptz default now()
);

create table claims (
  id      uuid primary key default gen_random_uuid(),
  rsvp_id uuid not null references rsvps(id) on delete cascade,
  item_id text not null references bring_items(id)
);

create index claims_item_idx on claims(item_id);

-- ---------- the list ----------
-- EDIT ME: change labels or quotas here, not in the JS.
-- quota = null means unlimited.

insert into bring_items (id, label, quota, sort) values
  ('alcohol',   'Alcohol',                    2, 10),
  ('mixers',    'Mixers / juice',             3, 20),
  ('garnish',   'Drink garnishes',            1, 30),
  ('balloons',  'Balloons',                   1, 50),
  ('flowers',   'Flowers',                    2, 60),
  ('sweet',     'Sweet snacks',               2, 70),
  ('savory',    'Savory snacks',              2, 80),
  ('plates',    'Clear plates',               1, 90),
  ('cups',      'Clear cups + napkins',       1, 100),
  ('game',      'A board game',               2, 110),
  ('vibes',     'Good vibes',              null, 120);

-- ---------- what the page is allowed to read ----------
-- Only counts. Never names, never notes.

create view bring_status as
  select
    i.id,
    i.label,
    i.quota,
    i.sort,
    (select count(*) from claims c where c.item_id = i.id)::int as claimed
  from bring_items i;

-- ---------- lock everything down ----------
-- RLS on with no policies = nobody with the anon key can read these
-- tables directly. The view runs as its owner, so counts still work.

alter table rsvps       enable row level security;
alter table claims      enable row level security;
alter table bring_items enable row level security;

revoke all on rsvps  from anon, authenticated;
revoke all on claims from anon, authenticated;

grant select on bring_status to anon, authenticated;

-- ---------- the one way in ----------
-- Locks the item row, re-checks the quota, then inserts. Two people
-- grabbing the last slot at the same moment: one wins, one is told
-- it's full. Returns which claims went through.

create or replace function submit_rsvp(
  p_name      text,
  p_attending boolean,
  p_note      text,
  p_items     text[]
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rsvp   uuid;
  v_item   text;
  v_quota  int;
  v_count  int;
  v_ok     text[] := '{}';
  v_full   text[] := '{}';
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name is required';
  end if;

  insert into rsvps (name, attending, note)
  values (
    left(trim(p_name), 80),
    p_attending,
    left(coalesce(p_note, ''), 500)
  )
  returning id into v_rsvp;

  if p_attending then
    foreach v_item in array coalesce(p_items, '{}') loop

      select quota into v_quota
        from bring_items
       where id = v_item
         for update;

      if not found then
        continue;                      -- unknown item, ignore it
      end if;

      if v_quota is null then
        insert into claims (rsvp_id, item_id) values (v_rsvp, v_item);
        v_ok := v_ok || v_item;
      else
        select count(*) into v_count from claims where item_id = v_item;
        if v_count < v_quota then
          insert into claims (rsvp_id, item_id) values (v_rsvp, v_item);
          v_ok := v_ok || v_item;
        else
          v_full := v_full || v_item;
        end if;
      end if;

    end loop;
  end if;

  return json_build_object('claimed', v_ok, 'full', v_full);
end;
$$;

grant execute on function submit_rsvp(text, boolean, text, text[]) to anon;

-- ============================================================
--  To see your RSVPs: Table Editor -> rsvps, or run
--    select r.name, r.attending, r.note,
--           string_agg(i.label, ', ') as bringing
--      from rsvps r
--      left join claims c on c.rsvp_id = r.id
--      left join bring_items i on i.id = c.item_id
--     group by r.id
--     order by r.created_at;
-- ============================================================
