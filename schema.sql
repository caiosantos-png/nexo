-- ============================================================
-- NEXO — schema Supabase (Fase 1)
-- Rode isto no SQL Editor do seu projeto (supabase.com/dashboard)
-- Requer Supabase Auth já habilitado (vem habilitado por padrão).
-- ============================================================

create extension if not exists "pgcrypto";

-- ========= IDENTIDADE =========
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  empresa text,
  avatar_url text,
  created_at timestamptz default now()
);

-- cria o profile automaticamente quando alguém se cadastra
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome) values (new.id, new.raw_user_meta_data->>'nome');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ========= PROJETOS =========
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  area text,
  descricao text,
  tema jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========= ARQUIVOS IMPORTADOS (usado a partir da Fase 1.2 — import) =========
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  nome_arquivo text not null,
  storage_path text,
  tamanho_bytes bigint,
  status text default 'processando',
  created_at timestamptz default now()
);

-- ========= DATASETS (1 aba selecionada = 1 dataset) =========
create table if not exists datasets (
  id uuid primary key default gen_random_uuid(),
  file_id uuid references files(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  nome_aba text,
  rotulo text,
  total_registros int default 0,
  created_at timestamptz default now()
);

-- ========= METADADOS DE COLUNA (coração da universalidade) =========
create table if not exists dataset_columns (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  nome_coluna text not null,
  ordem int,
  tipo_detectado text,          -- 'data' | 'numero' | 'moeda' | 'booleano' | 'categoria' | 'texto'
  papel text,                   -- 'dimensao' | 'metrica' | 'data' | 'identificador' | 'ignorar'
  confianca numeric,
  confirmado_por_usuario boolean default false,
  created_at timestamptz default now()
);

-- ========= REGISTROS (genérico — funciona pra qualquer planilha) =========
create table if not exists records (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  dados jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_records_dataset on records(dataset_id);
create index if not exists idx_records_dados on records using gin (dados);

-- ========= DASHBOARDS E WIDGETS =========
create table if not exists dashboards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  nome text default 'Painel principal',
  created_at timestamptz default now()
);

create table if not exists widgets (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  tipo text not null,           -- 'kpi' | 'bar' | 'line' | 'donut' | 'table' | 'scatter'
  titulo text,
  config jsonb default '{}',
  ordem int default 0,
  visivel boolean default true
);

-- ========= INSIGHTS =========
create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  texto text not null,
  categoria text,
  relevancia int default 0,
  created_at timestamptz default now()
);

-- ========= APRESENTAÇÕES =========
create table if not exists presentations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  nome text default 'Apresentação',
  created_at timestamptz default now()
);

create table if not exists slides (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references presentations(id) on delete cascade,
  tipo text not null,
  conteudo jsonb default '{}',
  ordem int default 0
);

-- ============================================================
-- RLS — cada usuário só acessa o que é seu, em cascata via projeto
-- ============================================================
alter table profiles enable row level security;
alter table projects enable row level security;
alter table files enable row level security;
alter table datasets enable row level security;
alter table dataset_columns enable row level security;
alter table records enable row level security;
alter table dashboards enable row level security;
alter table widgets enable row level security;
alter table insights enable row level security;
alter table presentations enable row level security;
alter table slides enable row level security;

create policy "profile do próprio usuário" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "projetos do próprio usuário" on projects for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "files via projeto" on files for all
  using (project_id in (select id from projects where owner_id = auth.uid()))
  with check (project_id in (select id from projects where owner_id = auth.uid()));

create policy "datasets via projeto" on datasets for all
  using (project_id in (select id from projects where owner_id = auth.uid()))
  with check (project_id in (select id from projects where owner_id = auth.uid()));

create policy "dashboards via projeto" on dashboards for all
  using (project_id in (select id from projects where owner_id = auth.uid()))
  with check (project_id in (select id from projects where owner_id = auth.uid()));

create policy "presentations via projeto" on presentations for all
  using (project_id in (select id from projects where owner_id = auth.uid()))
  with check (project_id in (select id from projects where owner_id = auth.uid()));

create policy "dataset_columns via dataset" on dataset_columns for all
  using (dataset_id in (
    select d.id from datasets d join projects p on p.id = d.project_id
    where p.owner_id = auth.uid()
  ))
  with check (dataset_id in (
    select d.id from datasets d join projects p on p.id = d.project_id
    where p.owner_id = auth.uid()
  ));

create policy "records via dataset" on records for all
  using (dataset_id in (
    select d.id from datasets d join projects p on p.id = d.project_id
    where p.owner_id = auth.uid()
  ))
  with check (dataset_id in (
    select d.id from datasets d join projects p on p.id = d.project_id
    where p.owner_id = auth.uid()
  ));

create policy "insights via dataset" on insights for all
  using (dataset_id in (
    select d.id from datasets d join projects p on p.id = d.project_id
    where p.owner_id = auth.uid()
  ))
  with check (dataset_id in (
    select d.id from datasets d join projects p on p.id = d.project_id
    where p.owner_id = auth.uid()
  ));

create policy "widgets via dashboard" on widgets for all
  using (dashboard_id in (
    select db.id from dashboards db join projects p on p.id = db.project_id
    where p.owner_id = auth.uid()
  ))
  with check (dashboard_id in (
    select db.id from dashboards db join projects p on p.id = db.project_id
    where p.owner_id = auth.uid()
  ));

create policy "slides via presentation" on slides for all
  using (presentation_id in (
    select pr.id from presentations pr join projects p on p.id = pr.project_id
    where p.owner_id = auth.uid()
  ))
  with check (presentation_id in (
    select pr.id from presentations pr join projects p on p.id = pr.project_id
    where p.owner_id = auth.uid()
  ));

-- ============================================================
-- STORAGE — bucket para os arquivos originais importados
-- ============================================================
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

create policy "usuário lê seus próprios arquivos"
  on storage.objects for select
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "usuário envia seus próprios arquivos"
  on storage.objects for insert
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "usuário apaga seus próprios arquivos"
  on storage.objects for delete
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
