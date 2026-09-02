-- Staff (non-admin, role='full_no_edit') Edit/Delete request-approval system.
-- Staff no longer gets free Edit/Delete on any record — every Edit/Delete action
-- (across all modules, master data included) checks for an admin-approved request
-- scoped to that exact (table, record, action). Admin approves/rejects from
-- Settings > Permission Requests. Once the staff member uses an approved
-- permission, the app marks it 'fulfilled' (one-time use, matches the existing
-- print_reprint_requests pattern this replaces).

create table if not exists public.permission_requests (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  record_label text not null,
  action text not null check (action in ('edit', 'delete')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'fulfilled')),
  requested_by uuid not null references public.app_users(id),
  resolved_by uuid references public.app_users(id),
  resolved_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists permission_requests_lookup_idx
  on public.permission_requests (table_name, record_id, action, status);
create index if not exists permission_requests_requested_by_idx
  on public.permission_requests (requested_by, status);

alter table public.permission_requests enable row level security;

create policy "auth_read_permission_requests" on public.permission_requests
  for select to authenticated using (auth.role() = 'authenticated');

create policy "auth_insert_own_permission_requests" on public.permission_requests
  for insert to authenticated with check (requested_by = auth.uid());

-- Admin approves/rejects any request.
create policy "admin_update_permission_requests" on public.permission_requests
  for update to authenticated
  using (exists (select 1 from public.app_users au where au.id = auth.uid() and au.role = 'admin'))
  with check (exists (select 1 from public.app_users au where au.id = auth.uid() and au.role = 'admin'));

-- The requester may flip their own already-approved request to 'fulfilled'
-- once they've used it (self-service, cannot self-approve — status must
-- already be 'approved' going in, and can only move to 'fulfilled').
create policy "requester_fulfill_own_permission_requests" on public.permission_requests
  for update to authenticated
  using (requested_by = auth.uid() and status = 'approved')
  with check (requested_by = auth.uid() and status = 'fulfilled');
