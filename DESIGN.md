# Design

## Tables
- **profiles**(id → auth.users, name, email unique): public copy of user info, filled by a trigger on signup.
- **projects**(id, name, owner_id → profiles, created_at)
- **project_members**(project_id, user_id) PK on both. The owner is added automatically, so the owner can be assigned tasks too.
- **milestones**(id, project_id, title, planned_date, status Open/Done)
- **tasks**(id, project_id, milestone_id, title, status, priority, planned_date, assigned_to, created_at)

## Answers
1. **Unassigned task:** only the owner sees it. The task SELECT policy is `is_owner(project) OR assigned_to = auth.uid()`; NULL never equals a user id, so no member matches.
2. **Status-only for members:** RLS limits rows, not columns, so a `BEFORE UPDATE` trigger (`tasks_guard`) compares every non-status column of OLD and NEW and raises an error for non-owners if any differ.
3. **Assignee must be a project member:** composite foreign key `(project_id, assigned_to) → project_members(project_id, user_id)`. Postgres rejects any non-member, and NULL (unassigned) is allowed.
4. **Direct API calls:** the anon key is public by design. RLS is enabled on every table and is evaluated by Postgres for every request, using the caller's JWT. Without the policies' conditions, rows are simply not returned. The service_role key is never used in the frontend.
