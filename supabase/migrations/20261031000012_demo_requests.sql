-- "Request a demo" leads from the platform home page. Written by the server (service role)
-- and emailed to sales through Resend; kept here so a lead survives an email failure.
create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  cafe_name text not null check (length(cafe_name) between 1 and 80),
  city text not null check (length(city) between 1 and 80),
  phone text check (phone is null or length(phone) <= 30),
  email text check (email is null or length(email) <= 120),
  tables text check (tables is null or length(tables) <= 10),
  note text check (note is null or length(note) <= 500),
  emailed_at timestamptz,
  email_error text,
  created_at timestamptz not null default now()
);
create index demo_requests_created_idx on public.demo_requests (created_at desc);

-- Nobody reads or writes this through the API except the service role.
alter table public.demo_requests enable row level security;
revoke all on public.demo_requests from anon, authenticated;
