-- Favorites: saves a product (by title + region), not a frozen price
-- snapshot — prices change constantly, so viewing favorites always re-runs
-- a live comparison rather than showing stale numbers.

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_title text not null,
  image_url text,
  region text not null,
  created_at timestamptz not null default now(),
  unique (user_id, product_title, region)
);

alter table public.favorites enable row level security;

create policy "Users can view their own favorites"
  on public.favorites for select
  using (auth.uid() = user_id);

create policy "Users can add their own favorites"
  on public.favorites for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own favorites"
  on public.favorites for delete
  using (auth.uid() = user_id);

create index if not exists favorites_user_id_idx on public.favorites (user_id, created_at desc);
