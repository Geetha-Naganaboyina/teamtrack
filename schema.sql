-- Team Task Tracker: tables + RLS. Run in Supabase SQL Editor.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  owner_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Includes the owner too, so the owner can also be assigned tasks.
create table public.project_members (
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (project_id, user_id)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  planned_date date,
  status text not null default 'Open' check (status in ('Open','Done')),
  unique (project_id, id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  milestone_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  status text not null default 'Todo' check (status in ('Todo','In Progress','In Review','Done')),
  priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
  planned_date date,
  assigned_to uuid,
  created_at timestamptz not null default now(),
  -- milestone must belong to the same project
  foreign key (project_id, milestone_id) references public.milestones(project_id, id) on delete cascade,
  -- assignee must be a member of the same project (skipped when NULL = unassigned)
  foreign key (project_id, assigned_to) references public.project_members(project_id, user_id)
);

-- ---------- helper functions (SECURITY DEFINER avoids RLS recursion) ----------
create function public.is_owner(pid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from projects where id = pid and owner_id = auth.uid()) $$;

create function public.is_member(pid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from project_members where project_id = pid and user_id = auth.uid()) $$;

create function public.shares_project(uid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from project_members a join project_members b using (project_id)
                  where a.user_id = auth.uid() and b.user_id = uid) $$;

-- ---------- triggers ----------
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, email)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)), lower(new.email));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.add_owner_as_member() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into project_members (project_id, user_id) values (new.id, new.owner_id);
  return new;
end $$;
create trigger on_project_created after insert on public.projects for each row execute function public.add_owner_as_member();

-- Non-owners may change ONLY the status column of a task.
create function public.tasks_guard() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_owner(old.project_id) then
    if row(new.id, new.project_id, new.milestone_id, new.title, new.priority, new.planned_date, new.assigned_to, new.created_at)
       is distinct from
       row(old.id, old.project_id, old.milestone_id, old.title, old.priority, old.planned_date, old.assigned_to, old.created_at) then
      raise exception 'Members can only change the status of their own tasks';
    end if;
  end if;
  return new;
end $$;
create trigger tasks_guard_trg before update on public.tasks for each row execute function public.tasks_guard();

-- Owner adds a member by email (user must already be signed up).
create function public.add_member_by_email(p_project_id uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_owner(p_project_id) then raise exception 'Only the owner can add members'; end if;
  select id into uid from profiles where email = lower(trim(p_email));
  if uid is null then raise exception 'No user with that email has signed up yet'; end if;
  insert into project_members (project_id, user_id) values (p_project_id, uid) on conflict do nothing;
end $$;
revoke all on function public.add_member_by_email(uuid, text) from public, anon;
grant execute on function public.add_member_by_email(uuid, text) to authenticated;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_project(id));

create policy projects_select on public.projects for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = auth.uid());
create policy projects_update on public.projects for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy projects_delete on public.projects for delete to authenticated
  using (owner_id = auth.uid());

-- members are read-only from the client; changes go through add_member_by_email()
create policy members_select on public.project_members for select to authenticated
  using (public.is_member(project_id));

create policy milestones_select on public.milestones for select to authenticated
  using (public.is_member(project_id));
create policy milestones_insert on public.milestones for insert to authenticated
  with check (public.is_owner(project_id));
create policy milestones_update on public.milestones for update to authenticated
  using (public.is_owner(project_id)) with check (public.is_owner(project_id));
create policy milestones_delete on public.milestones for delete to authenticated
  using (public.is_owner(project_id));

-- Owner sees all tasks; a member sees only tasks assigned to them.
-- Unassigned tasks (assigned_to NULL) match neither clause for members -> owner only.
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_owner(project_id) or assigned_to = auth.uid());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_owner(project_id));
create policy tasks_update_owner on public.tasks for update to authenticated
  using (public.is_owner(project_id)) with check (public.is_owner(project_id));
create policy tasks_update_member on public.tasks for update to authenticated
  using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());  -- columns limited by tasks_guard
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_owner(project_id));

-- ---------- table privileges (RLS still decides which rows are visible) ----------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.projects, public.milestones, public.tasks to authenticated;
grant select on public.profiles, public.project_members to authenticated;