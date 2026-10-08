// Fills an empty demo server with a household's worth of lists and tasks.
//
// Runs inside the yarukoto container (reset.sh does `docker compose exec`), so it
// needs nothing but Node and talks to the server on localhost with the owner token.
// Due dates are relative to today in YARUKOTO_TZ, which is why the reset re-seeds
// rather than restoring a snapshot: a reviewer should always see a real "Today".

const base = `http://localhost:${process.env.PORT ?? 8080}`;
const token = process.env.YARUKOTO_TOKEN;
const zone = process.env.YARUKOTO_TZ || 'UTC';
if (!token) throw new Error('YARUKOTO_TOKEN is not set');

const stamp = new Date().toISOString();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
function day(offset) {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const folders = [
  { id: 'f-work', name: 'Work', order: 0, updatedAt: stamp },
  { id: 'f-home', name: 'Home', order: 2, updatedAt: stamp },
];
const lists = [
  { id: 'l-projects', name: 'Projects', color: '#2E62D9', folderId: 'f-work', order: 0, updatedAt: stamp },
  { id: 'l-admin', name: 'Admin', color: '#DB8A00', folderId: 'f-work', order: 1, updatedAt: stamp },
  { id: 'l-reading', name: 'Reading', color: '#C22B23', folderId: null, order: 1, updatedAt: stamp },
  { id: 'l-house', name: 'House', color: '#1E7A3C', folderId: 'f-home', order: 0, updatedAt: stamp, shared: true },
  { id: 'l-groceries', name: 'Groceries', color: '#8A5FD6', folderId: 'f-home', order: 1, updatedAt: stamp, shared: true },
];

let order = 0;
let n = 0;
const task = (fields) => ({
  id: `t-demo-${++n}`,
  notes: '',
  priority: 'none',
  tags: [],
  subtasks: [],
  completed: false,
  createdAt: stamp,
  updatedAt: stamp,
  order: order++,
  listId: null,
  ...fields,
});
const steps = (...titles) => titles.map(([title, done], i) => ({ id: `st-${n + 1}-${i}`, title, done }));

const tasks = [
  task({ title: 'Pay rent', listId: 'l-house', priority: 'high', tags: ['bills'], dueDate: day(-1),
    repeat: { rule: 'FREQ=MONTHLY;INTERVAL=1', from: 'due' } }),
  task({ title: 'Call the plumber about the kitchen sink', listId: 'l-house', dueDate: day(0), dueTime: '10:00' }),
  task({ title: 'Take out the bins', listId: 'l-house', tags: ['chores'], dueDate: day(1), dueTime: '19:00',
    repeat: { rule: 'FREQ=WEEKLY;INTERVAL=1', from: 'due' } }),
  task({ title: 'Water the plants', listId: 'l-house', completed: true, completedAt: stamp }),
  task({ title: 'Renew car registration', listId: 'l-house', priority: 'medium', dueDate: day(9) }),
  task({ title: 'Oat milk', listId: 'l-groceries' }),
  task({ title: 'Eggs', listId: 'l-groceries' }),
  task({ title: 'Coffee beans', listId: 'l-groceries', priority: 'medium' }),
  task({ title: 'Basil', listId: 'l-groceries', completed: true, completedAt: stamp }),
  task({ title: 'Ship the onboarding redesign', listId: 'l-projects', priority: 'high', tags: ['launch'], dueDate: day(0),
    notes: 'Final pass on copy, then **ship it**.',
    subtasks: steps(['Review mockups', true], ['Update screenshots', true], ['Write release notes', false], ['Announce', false]) }),
  task({ title: 'Prepare quarterly review slides', listId: 'l-projects', priority: 'medium', dueDate: day(3) }),
  task({ title: 'Reply to design feedback', listId: 'l-projects', dueDate: day(1) }),
  task({ title: 'File expense report', listId: 'l-admin', priority: 'low', dueDate: day(5) }),
  task({ title: 'Book team offsite venue', listId: 'l-admin', priority: 'medium', dueDate: day(12) }),
  task({ title: 'Weekly planning', listId: 'l-admin', dueDate: day(0), dueTime: '09:00',
    repeat: { rule: 'FREQ=WEEKLY;INTERVAL=1', from: 'due' } }),
  task({ title: 'The Design of Everyday Things', listId: 'l-reading' }),
  task({ title: 'Finish "Four Thousand Weeks"', listId: 'l-reading', dueDate: day(14) }),
  task({ title: 'Book dentist appointment', priority: 'medium' }),
  task({ title: 'Reply to Sam about the cabin weekend', dueDate: day(1) }),
  task({ title: 'Look into standing desk options' }),
];

const res = await fetch(`${base}/api/v1/sync`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ folders, lists, tasks }),
});
if (!res.ok) throw new Error(`Seeding failed: ${res.status} ${await res.text()}`);
const body = await res.json();
console.log(`Seeded ${body.tasks?.length ?? 0} tasks in ${body.lists?.length ?? 0} lists for ${today} (${zone}).`);
