-- Split App RLS policies
-- Apply in Supabase SQL Editor after confirming schema/bucket names.
-- Note: requests using SERVICE ROLE key bypass RLS.

-- =========================
-- TABLE RLS
-- =========================

alter table public.users enable row level security;
alter table public.groups enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;

-- USERS
drop policy if exists "users_select_self" on public.users;
create policy "users_select_self"
on public.users for select
to authenticated
using (id = auth.uid());

drop policy if exists "users_update_self" on public.users;
create policy "users_update_self"
on public.users for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- GROUPS
drop policy if exists "groups_select_member_or_creator" on public.groups;
create policy "groups_select_member_or_creator"
on public.groups for select
to authenticated
using (
  created_by = auth.uid()
  or auth.uid() = any(members)
);

drop policy if exists "groups_insert_creator" on public.groups;
create policy "groups_insert_creator"
on public.groups for insert
to authenticated
with check (
  created_by = auth.uid()
  and auth.uid() = any(members)
);

drop policy if exists "groups_update_creator_only" on public.groups;
create policy "groups_update_creator_only"
on public.groups for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists "groups_delete_creator_only" on public.groups;
create policy "groups_delete_creator_only"
on public.groups for delete
to authenticated
using (created_by = auth.uid());

-- EXPENSES
drop policy if exists "expenses_select_related_user" on public.expenses;
create policy "expenses_select_related_user"
on public.expenses for select
to authenticated
using (
  paid_by = auth.uid()
  or auth.uid() = any(split_between)
  or (
    group_id is not null
    and exists (
      select 1
      from public.groups g
      where g.id = expenses.group_id
        and auth.uid() = any(g.members)
    )
  )
);

drop policy if exists "expenses_insert_payer" on public.expenses;
create policy "expenses_insert_payer"
on public.expenses for insert
to authenticated
with check (
  paid_by = auth.uid()
  and (
    group_id is null
    or exists (
      select 1
      from public.groups g
      where g.id = expenses.group_id
        and auth.uid() = any(g.members)
    )
  )
);

drop policy if exists "expenses_update_payer" on public.expenses;
create policy "expenses_update_payer"
on public.expenses for update
to authenticated
using (paid_by = auth.uid())
with check (paid_by = auth.uid());

drop policy if exists "expenses_delete_payer" on public.expenses;
create policy "expenses_delete_payer"
on public.expenses for delete
to authenticated
using (paid_by = auth.uid());

-- SETTLEMENTS
drop policy if exists "settlements_select_related_user" on public.settlements;
create policy "settlements_select_related_user"
on public.settlements for select
to authenticated
using (
  from_user_id = auth.uid()
  or to_user_id = auth.uid()
  or created_by = auth.uid()
  or (
    group_id is not null
    and exists (
      select 1
      from public.groups g
      where g.id = settlements.group_id
        and auth.uid() = any(g.members)
    )
  )
);

drop policy if exists "settlements_insert_creator_or_participant" on public.settlements;
create policy "settlements_insert_creator_or_participant"
on public.settlements for insert
to authenticated
with check (
  created_by = auth.uid()
  and (from_user_id = auth.uid() or to_user_id = auth.uid())
  and (
    group_id is null
    or exists (
      select 1
      from public.groups g
      where g.id = settlements.group_id
        and auth.uid() = any(g.members)
    )
  )
);

drop policy if exists "settlements_update_creator_only" on public.settlements;
create policy "settlements_update_creator_only"
on public.settlements for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists "settlements_delete_creator_only" on public.settlements;
create policy "settlements_delete_creator_only"
on public.settlements for delete
to authenticated
using (created_by = auth.uid());

-- =========================
-- STORAGE RLS
-- =========================

-- avatars (public bucket)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
on storage.objects for select
to public
using (bucket_id = 'avatars');

drop policy if exists "avatars_auth_upload" on storage.objects;
create policy "avatars_auth_upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_auth_update" on storage.objects;
create policy "avatars_auth_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_auth_delete" on storage.objects;
create policy "avatars_auth_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- receipts (public bucket for direct image rendering)
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

drop policy if exists "receipts_public_read" on storage.objects;
create policy "receipts_public_read"
on storage.objects for select
to public
using (bucket_id = 'receipts');

drop policy if exists "receipts_auth_upload" on storage.objects;
create policy "receipts_auth_upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "receipts_auth_update" on storage.objects;
create policy "receipts_auth_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "receipts_auth_delete" on storage.objects;
create policy "receipts_auth_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);
