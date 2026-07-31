-- ============================================================
-- Relevé MT - étape 2
-- Authentification + rôles + affectation + lectures mensuelles
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('employee','manager')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.employee_clients (
  employee_id uuid not null references public.profiles(id) on delete cascade,
  contract_no bigint not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (employee_id, contract_no)
);

create table if not exists public.meter_readings (
  id bigint generated always as identity primary key,
  contract_no bigint not null,
  meter_no text not null,
  period text not null,
  reading_date date not null default current_date,
  employee_id uuid references public.profiles(id),
  employee_name text,
  indexes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(contract_no, period)
);

create index if not exists meter_readings_period_idx
  on public.meter_readings(period);

create index if not exists meter_readings_contract_idx
  on public.meter_readings(contract_no);

alter table public.profiles enable row level security;
alter table public.employee_clients enable row level security;
alter table public.meter_readings enable row level security;

-- Helper: rôle de l'utilisateur connecté.
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and active = true
  limit 1;
$$;

-- Profiles
create policy "profiles self read"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.current_role() = 'manager');

-- Affectations
create policy "employee sees own assignments"
on public.employee_clients for select
to authenticated
using (employee_id = auth.uid() or public.current_role() = 'manager');

create policy "manager manages assignments"
on public.employee_clients for all
to authenticated
using (public.current_role() = 'manager')
with check (public.current_role() = 'manager');

-- Lectures
create policy "manager reads all readings"
on public.meter_readings for select
to authenticated
using (public.current_role() = 'manager');

create policy "employee reads assigned readings"
on public.meter_readings for select
to authenticated
using (
  public.current_role() = 'manager'
  or employee_id = auth.uid()
  or exists (
    select 1
    from public.employee_clients ec
    where ec.employee_id = auth.uid()
      and ec.contract_no = meter_readings.contract_no
      and ec.active = true
  )
);

create policy "employee inserts assigned readings"
on public.meter_readings for insert
to authenticated
with check (
  public.current_role() = 'manager'
  or (
    employee_id = auth.uid()
    and exists (
      select 1
      from public.employee_clients ec
      where ec.employee_id = auth.uid()
        and ec.contract_no = contract_no
        and ec.active = true
    )
  )
);

create policy "employee updates own assigned readings"
on public.meter_readings for update
to authenticated
using (
  public.current_role() = 'manager'
  or (
    employee_id = auth.uid()
    and exists (
      select 1
      from public.employee_clients ec
      where ec.employee_id = auth.uid()
        and ec.contract_no = meter_readings.contract_no
        and ec.active = true
    )
  )
)
with check (
  public.current_role() = 'manager'
  or employee_id = auth.uid()
);

-- Realtime
alter table public.meter_readings replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meter_readings'
  ) then
    alter publication supabase_realtime add table public.meter_readings;
  end if;
end $$;

-- Realtime for assignment changes too, so employee lists can be refreshed live.
alter table public.employee_clients replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'employee_clients'
  ) then
    alter publication supabase_realtime add table public.employee_clients;
  end if;
end $$;
