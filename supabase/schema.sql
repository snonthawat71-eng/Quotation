-- =========================================================
-- สคีมาฐานข้อมูลสำหรับแอปใบเสนอราคา / ใบแจ้งหนี้
-- วิธีใช้: เข้า Supabase > SQL Editor > วางทั้งไฟล์นี้ > กด Run
-- =========================================================

-- บริษัท / ผู้ออกเอกสาร (มีได้หลายบริษัทต่อ 1 บัญชีผู้ใช้)
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  address text,
  tax_id text,
  phone text,
  email text,
  seller_name text,          -- ชื่อผู้ขาย/พนักงานขาย โชว์หัวเอกสาร (เช่น ELF)
  logo text,                 -- รูปเก็บเป็น data URL
  signature text,
  stamp text,
  bank_name text,
  bank_account_name text,
  bank_account_no text,
  default_notes text,        -- หมายเหตุมาตรฐาน เติมอัตโนมัติตอนสร้างเอกสารใหม่
  payment_terms text,        -- เงื่อนไขชำระเงินมาตรฐาน
  signer_left text,          -- ป้ายช่องเซ็นซ้าย (ค่าเริ่มต้น Customer)
  signer_right text,         -- ป้ายช่องเซ็นขวา (ค่าเริ่มต้น Designer)
  created_at timestamptz not null default now()
);

-- สมุดลูกค้า
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  address text,
  tax_id text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

-- สมุดสินค้า / บริการ
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  unit text,
  price numeric not null default 0,
  created_at timestamptz not null default now()
);

-- เอกสาร (ใบเสนอราคา + ใบแจ้งหนี้)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  doc_type text not null check (doc_type in ('QT','INV')),
  doc_number text not null,
  issue_date date not null default current_date,
  due_date date,
  company_id uuid references public.companies (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  company jsonb,             -- สำเนาข้อมูลบริษัท ณ วันออกเอกสาร
  customer jsonb,            -- สำเนาข้อมูลลูกค้า ณ วันออกเอกสาร
  items jsonb not null default '[]'::jsonb,
  discount numeric not null default 0,
  discount_type text not null default 'amount' check (discount_type in ('amount','percent')),
  vat_percent numeric not null default 0,
  wht_percent numeric not null default 0,
  notes text,
  payment_terms text,
  ref_note text,
  status text not null default 'draft',
  ref_doc_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_type_idx on public.documents (user_id, doc_type, created_at desc);
create index if not exists documents_number_idx on public.documents (user_id, doc_number);

-- ===================== ความปลอดภัย (RLS) =====================
-- แต่ละบัญชีผู้ใช้เห็นเฉพาะข้อมูลของตัวเองเท่านั้น
alter table public.companies enable row level security;
alter table public.customers enable row level security;
alter table public.products  enable row level security;
alter table public.documents enable row level security;

drop policy if exists "own companies" on public.companies;
create policy "own companies" on public.companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own customers" on public.customers;
create policy "own customers" on public.customers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own products" on public.products;
create policy "own products" on public.products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own documents" on public.documents;
create policy "own documents" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
