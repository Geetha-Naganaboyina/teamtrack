# Team Task Tracker

React (Vite) + Supabase. Permissions are enforced in the database with RLS, a trigger and foreign keys (`schema.sql`).

## Setup
1. Create a Supabase project. In Authentication > Providers > Email, turn off "Confirm email".
2. In the SQL Editor, run `schema.sql`. The `grant` lines at the end are required, or new projects give "permission denied".
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable/anon key only, never the secret key).
4. Run `npm install`, then `npm run dev`.

## Test results (logged in as a member, Vasavi)
| Check | Result |
|---|---|
| I can see only my own tasks | PASS |
| I cannot change the priority of my task | PASS |
| I cannot change the status of another member's task | PASS |

I also ran the checks against the Supabase API directly with `npm run test:perms`. All 4 checks passed.

## Prompts I gave Claude
1. "develop the application": it produced the database schema with RLS policies, the React app and the test script.
2. "permission denied for table projects": it explained that tables need `grant` statements as well as RLS, and gave me the SQL to fix it. I added those lines to `schema.sql`.
3. "i need to develop then it explained that the app is JavaScript (React), and that the brief requires React or HTML/JS, so I kept the stack.
4. "develop the application"** (pasted the candidate brief). Claude produced the Supabase schema with RLS policies, a trigger that limits members to status-only updates, a composite foreign key for assignees, the React app and a test script. I then read through the schema to understand each policy.
5. "permission denied for table projects"** (pasted the error from the app). Claude explained that RLS decides which rows are visible, but the `authenticated` role also needs table privileges. It gave me the `grant` statements, which I ran in Supabase and added to `schema.sql`.
6. Pasted the output of `npm run test:perms` where test 2 showed FAIL.** Claude found that the test was wrong, not the database: it set priority to the value the task already had, so nothing changed and no error appeared. It rewrote the test to try a different value and check the priority afterwards.

## One thing I fixed
Test 2 (cannot change priority) first showed FAIL. The test set the priority to the value the task already had, so nothing changed and no error came back. I changed it to try a different value and then check that the priority stayed the same. It now passes.

## Not finished
- Milestone title and date cannot be edited (status only).
- No delete buttons for tasks, milestones or members.
- Members can only be added, not removed.