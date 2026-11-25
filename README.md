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

## One thing I fixed
Test 2 (cannot change priority) first showed FAIL. The test set the priority to the value the task already had, so nothing changed and no error came back. I changed it to try a different value and then check that the priority stayed the same. It now passes.

## Not finished
- Milestone title and date cannot be edited (status only).
- No delete buttons for tasks, milestones or members.
- Members can only be added, not removed.