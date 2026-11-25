// Bonus: permission checks straight against the Supabase API (no UI).
// Usage: set env vars in your shell, then `npm run test:perms`
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, MEMBER_EMAIL, MEMBER_PASSWORD,
//   OWN_TASK_ID (assigned to the member), OTHER_TASK_ID (assigned to someone else)
import { createClient } from '@supabase/supabase-js'
const e = process.env
const sb = createClient(e.VITE_SUPABASE_URL, e.VITE_SUPABASE_ANON_KEY)
const { data: auth, error } = await sb.auth.signInWithPassword({ email: e.MEMBER_EMAIL, password: e.MEMBER_PASSWORD })
if (error) throw error
const me = auth.user.id
const report = (name, ok) => console.log(ok ? 'PASS' : 'FAIL', name)

const { data: visible } = await sb.from('tasks').select('id, assigned_to')
report('1. I see only my own tasks', visible.length > 0 && visible.every((t) => t.assigned_to === me))

// Test 2: try a priority that is really different from the current one
const { data: own } = await sb.from('tasks').select('priority').eq('id', e.OWN_TASK_ID).single()
const newPriority = own.priority === 'Low' ? 'Medium' : 'Low'
const r2 = await sb.from('tasks').update({ priority: newPriority }).eq('id', e.OWN_TASK_ID).select()
const { data: after } = await sb.from('tasks').select('priority').eq('id', e.OWN_TASK_ID).single()
report('2. Cannot change priority of my task', !!r2.error && after.priority === own.priority)

const r3 = await sb.from('tasks').update({ status: 'Done' }).eq('id', e.OTHER_TASK_ID).select()
report('3. Cannot change status of another member\'s task', !r3.error && r3.data.length === 0)

const r4 = await sb.from('tasks').update({ status: 'In Review' }).eq('id', e.OWN_TASK_ID).select()
report('4. CAN change status of my own task', !r4.error && r4.data.length === 1)