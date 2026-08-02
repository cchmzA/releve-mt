-- ============================================================
-- Relevé MT - étape 3
-- جدول الزبناء (clients) — بديل عن اللائحة الثابتة (hardcoded)
-- ============================================================

create table if not exists public.clients (
  contract_no bigint primary key,
  meter_no text not null,
  sector text not null,
  name text not null,
  postes jsonb not null default '["Plein","Pointe","Creux","Total","Plein","Pointe","Creux","Total","Plein","Pointe","Creux","Total","Total","Plein","Pointe","Creux","EAIPH1","EAIPH2","EAIPH3","EAEPH1","EAEPH2","EAEPH3"]'::jsonb,
  old_index jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;

-- كل مستخدم مسجل (موظف أو مسؤول) يقدر يقرا الزبناء النشطين
create policy "authenticated reads active clients"
on public.clients for select
to authenticated
using (active = true or public.current_role() = 'manager');

-- المسؤول فقط يقدر يزيد/يبدل/يمسح
create policy "manager manages clients"
on public.clients for all
to authenticated
using (public.current_role() = 'manager')
with check (public.current_role() = 'manager');

-- Realtime، باش الزبون الجديد يبان تلقائياً عند الموظفين بلا ما يعاودو فتح التطبيق
alter table public.clients replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'clients'
  ) then
    alter publication supabase_realtime add table public.clients;
  end if;
end $$;
