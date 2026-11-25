import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const STATUSES = ['Todo', 'In Progress', 'In Review', 'Done']
const PRIORITIES = ['Low', 'Medium', 'High']
const PCOLOR = { High: '#dc2626', Medium: '#eab308', Low: '#16a34a' }

export default function App() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <p>Loading…</p>
  return session ? <Home user={session.user} /> : <Auth />
}

function Auth() {
  const [mode, setMode] = useState('login')
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function submit(e) {
    e.preventDefault(); setErr(''); setInfo('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password })
      if (error) setErr(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email: f.email, password: f.password, options: { data: { name: f.name } } })
      if (error) setErr(error.message)
      else if (!data.session) setInfo('Account created. Confirm your email, then log in.')
    }
  }
  return (
    <form className="panel" onSubmit={submit} style={{ maxWidth: 360, margin: '60px auto' }}>
      <h2>{mode === 'login' ? 'Log in' : 'Sign up'}</h2>
      {mode === 'signup' && <input required placeholder="Name" value={f.name} onChange={set('name')} />}
      <input required type="email" placeholder="Email" value={f.email} onChange={set('email')} />
      <input required type="password" minLength={6} placeholder="Password" value={f.password} onChange={set('password')} />
      <div><button>{mode === 'login' ? 'Log in' : 'Sign up'}</button>
        <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Need an account?' : 'Have an account?'}</button></div>
      {err && <p className="err">{err}</p>}{info && <p>{info}</p>}
    </form>
  )
}

function Home({ user }) {
  const [projects, setProjects] = useState(null)
  const [current, setCurrent] = useState(null)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  async function load() {
    const { data, error } = await supabase.from('projects').select('*').order('created_at')
    if (error) setErr(error.message); else setProjects(data)
  }
  useEffect(() => { load() }, [])
  async function create(e) {
    e.preventDefault(); setErr('')
    const { error } = await supabase.from('projects').insert({ name })
    if (error) return setErr(error.message)
    setName(''); load()
  }
  return (
    <>
      <header>
        <h2>Team Task Tracker</h2>
        <span>{user.user_metadata?.name || user.email} <button onClick={() => supabase.auth.signOut()}>Log out</button></span>
      </header>
      {err && <p className="err">{err}</p>}
      {current ? (
        <Project key={current.id} project={current} user={user} onBack={() => setCurrent(null)} />
      ) : (
        <div className="panel">
          <form onSubmit={create}>
            <input required placeholder="New project name" value={name} onChange={(e) => setName(e.target.value)} />
            <button>Create project</button>
          </form>
          {projects && projects.length === 0 && <p className="muted">No projects yet. Create one above.</p>}
          {projects?.map((p) => (
            <div key={p.id}>
              <button onClick={() => setCurrent(p)}>{p.name}</button>
              <span className="muted"> {p.owner_id === user.id ? 'owner' : 'member'}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function Project({ project, user, onBack }) {
  const isOwner = project.owner_id === user.id
  const [members, setMembers] = useState([])
  const [milestones, setMilestones] = useState([])
  const [tasks, setTasks] = useState(null)
  const [editing, setEditing] = useState(null) // task id, or 'new'
  const [err, setErr] = useState('')
  const [msTitle, setMsTitle] = useState('')
  const [msDate, setMsDate] = useState('')
  const [email, setEmail] = useState('')

  async function load() {
    const [m, ms, t] = await Promise.all([
      supabase.from('project_members').select('user_id, profiles(name, email)').eq('project_id', project.id),
      supabase.from('milestones').select('*').eq('project_id', project.id).order('planned_date', { nullsFirst: false }),
      supabase.from('tasks').select('*').eq('project_id', project.id).order('created_at'),
    ])
    const e = m.error || ms.error || t.error
    if (e) return setErr(e.message)
    setMembers(m.data); setMilestones(ms.data); setTasks(t.data)
  }
  useEffect(() => { load() }, [])

  const nameOf = (id) => (id ? members.find((x) => x.user_id === id)?.profiles?.name ?? 'Unknown' : 'Unassigned')
  const msOf = (id) => milestones.find((x) => x.id === id)?.title ?? ''

  async function run(promise) {
    setErr('')
    const { data, error } = await promise
    if (error) setErr(error.message)
    else if (Array.isArray(data) && data.length === 0) setErr('Not allowed, or nothing changed.')
    await load()
    return !error
  }
  const updateTask = (id, patch) => run(supabase.from('tasks').update(patch).eq('id', id).select())
  const addMilestone = async (e) => {
    e.preventDefault()
    if (await run(supabase.from('milestones').insert({ project_id: project.id, title: msTitle, planned_date: msDate || null }))) { setMsTitle(''); setMsDate('') }
  }
  const addMember = async (e) => {
    e.preventDefault()
    if (await run(supabase.rpc('add_member_by_email', { p_project_id: project.id, p_email: email }))) setEmail('')
  }
  async function saveTask(values, id) {
    const row = { ...values, planned_date: values.planned_date || null, assigned_to: values.assigned_to || null }
    const ok = id
      ? await updateTask(id, row)
      : await run(supabase.from('tasks').insert({ ...row, project_id: project.id }))
    if (ok) setEditing(null)
  }

  return (
    <>
      <header><h3>{project.name} <span className="muted">({isOwner ? 'owner' : 'member'})</span></h3><button onClick={onBack}>All projects</button></header>
      {err && <p className="err">{err}</p>}

      {isOwner && (
        <div className="panel">
          <div className="row">
            <b>Team:</b> {members.map((m) => m.profiles?.name).join(', ')}
            <form onSubmit={addMember}>
              <input required type="email" placeholder="Member email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button>Add member</button>
            </form>
          </div>
          <div className="row">
            <b>Milestones:</b>
            {milestones.length === 0 && <span className="muted">none yet</span>}
            {milestones.map((m) => (
              <span key={m.id}>{m.title} {m.planned_date && `(${m.planned_date})`}
                <select value={m.status} onChange={(e) => run(supabase.from('milestones').update({ status: e.target.value }).eq('id', m.id).select())}>
                  <option>Open</option><option>Done</option></select></span>
            ))}
          </div>
          <form onSubmit={addMilestone}>
            <input required placeholder="Milestone title" value={msTitle} onChange={(e) => setMsTitle(e.target.value)} />
            <input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} />
            <button>Add milestone</button>
          </form>
          {milestones.length > 0 && editing !== 'new' && <button onClick={() => setEditing('new')}>+ New task</button>}
          {editing === 'new' && <TaskForm members={members} milestones={milestones} onSave={(v) => saveTask(v)} onCancel={() => setEditing(null)} />}
        </div>
      )}

      {tasks && tasks.length === 0 && <p className="muted">{isOwner ? 'No tasks yet. Add a milestone, then a task.' : 'No tasks are assigned to you.'}</p>}
      <div className="board">
        {STATUSES.map((s) => (
          <div className="col" key={s}>
            <b>{s}</b>
            {tasks?.filter((t) => t.status === s).map((t) => editing === t.id ? (
              <TaskForm key={t.id} initial={t} members={members} milestones={milestones} onSave={(v) => saveTask(v, t.id)} onCancel={() => setEditing(null)} />
            ) : (
              <div className="card" key={t.id} style={{ borderLeftColor: PCOLOR[t.priority] }}>
                <b>{t.title}</b>
                <div className="muted">{msOf(t.milestone_id)}</div>
                <div>{nameOf(t.assigned_to)}</div>
                <div className="muted">Due: {t.planned_date || 'no date'}</div>
                <span className="badge" style={{ background: PCOLOR[t.priority] }}>{t.priority}</span>
                <div>
                  <select value={t.status} onChange={(e) => updateTask(t.id, { status: e.target.value })}>
                    {STATUSES.map((x) => <option key={x}>{x}</option>)}
                  </select>
                  {isOwner && <button onClick={() => setEditing(t.id)}>Edit</button>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

function TaskForm({ initial, members, milestones, onSave, onCancel }) {
  const [v, setV] = useState({
    title: initial?.title ?? '', milestone_id: initial?.milestone_id ?? milestones[0]?.id ?? '',
    status: initial?.status ?? 'Todo', priority: initial?.priority ?? 'Medium',
    planned_date: initial?.planned_date ?? '', assigned_to: initial?.assigned_to ?? '',
  })
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  return (
    <form className="card" style={{ borderLeftColor: '#999' }} onSubmit={(e) => { e.preventDefault(); onSave(v) }}>
      <input required placeholder="Title" value={v.title} onChange={set('title')} />
      <select value={v.milestone_id} onChange={set('milestone_id')}>{milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select>
      <select value={v.status} onChange={set('status')}>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select>
      <select value={v.priority} onChange={set('priority')}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select>
      <input type="date" value={v.planned_date} onChange={set('planned_date')} />
      <select value={v.assigned_to} onChange={set('assigned_to')}>
        <option value="">Unassigned</option>
        {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profiles?.name}</option>)}
      </select>
      <button>Save</button><button type="button" onClick={onCancel}>Cancel</button>
    </form>
  )
}
