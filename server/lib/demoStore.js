// demoStore.js — a server-side sample calendar for the reviewer/demo account.
// Lets app reviewers exercise every tool 24/7 with no Mac agent involved.
// State persists in storage under demoCalendar:<userId>.
// Result shapes mirror the real calendar-agent (agent/calendar-jxa.mjs) exactly,
// so ChatGPT sees the same formats whether a call was served by the demo store or
// a paired Mac.

import { redis } from './redis.js';

export const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'reviewer@calendarbridge.demo').toLowerCase();

const KEY = (userId) => `demoCalendar:${userId}`;
const iso = (d) => new Date(d).toISOString();

// A fixed "now" so the demo window (next 7 days) always frames the seed events,
// no matter when a reviewer runs it.
const NOW = '2026-07-20T08:00:00Z';

function ev({ id, title, start, end, all_day = false, location = '', notes = '', calendar }) {
  return { id, title, start: iso(start), end: iso(end), all_day, location, notes, calendar };
}

function seed() {
  return {
    nextId: 8,
    calendars: [
      { name: 'Work', writable: true },
      { name: 'Personal', writable: true },
      { name: 'Family', writable: true },
    ],
    events: {
      'cal-1': ev({ id: 'cal-1', title: 'Team Standup', calendar: 'Work', start: '2026-07-20T09:30:00Z', end: '2026-07-20T10:00:00Z', location: 'Zoom' }),
      'cal-2': ev({ id: 'cal-2', title: 'Design Review', calendar: 'Work', start: '2026-07-20T13:00:00Z', end: '2026-07-20T14:00:00Z', notes: 'Review the connector UI' }),
      'cal-3': ev({ id: 'cal-3', title: 'Gym', calendar: 'Personal', start: '2026-07-21T07:00:00Z', end: '2026-07-21T08:00:00Z' }),
      'cal-4': ev({ id: 'cal-4', title: 'Soccer practice', calendar: 'Family', start: '2026-07-21T17:30:00Z', end: '2026-07-21T19:00:00Z', location: 'City Park' }),
      'cal-6': ev({ id: 'cal-6', title: 'Dentist', calendar: 'Personal', start: '2026-07-22T16:15:00Z', end: '2026-07-22T17:00:00Z', location: 'Downtown Dental', notes: 'Ask about the 9am slot' }),
      'cal-5': ev({ id: 'cal-5', title: "Mom's birthday dinner", calendar: 'Family', start: '2026-07-23T18:00:00Z', end: '2026-07-23T20:00:00Z', location: "Luigi's" }),
      'cal-7': ev({ id: 'cal-7', title: 'Q3 Planning offsite', calendar: 'Work', start: '2026-07-25T00:00:00Z', end: '2026-07-26T00:00:00Z', all_day: true }),
    },
  };
}

async function load(userId) {
  const raw = await redis.get(KEY(userId));
  if (!raw) {
    const db = seed();
    await redis.set(KEY(userId), JSON.stringify(db));
    return db;
  }
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

const save = (userId, db) => redis.set(KEY(userId), JSON.stringify(db));

// eventOut in calendar-jxa.mjs (get/create/update): full event view.
const eventView = (e) => ({
  id: e.id, title: e.title, start: e.start, end: e.end,
  all_day: !!e.all_day, location: e.location || '', notes: e.notes || '', calendar: e.calendar,
});
// list_events rows: id, title, start, end, location, calendar (no all_day/notes).
const listView = (e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, location: e.location || '', calendar: e.calendar });
// search_events rows: id, title, start, location, calendar (no end).
const searchView = (e) => ({ id: e.id, title: e.title, start: e.start, location: e.location || '', calendar: e.calendar });

const byStart = (a, b) => ((a.start || '9999') < (b.start || '9999') ? -1 : (a.start || '9999') > (b.start || '9999') ? 1 : 0);

export async function demoExec(userId, tool, args = {}) {
  const db = await load(userId);
  const all = () => Object.values(db.events);

  switch (tool) {
    case 'list_calendars': {
      return { calendars: db.calendars.map((c) => ({ name: c.name, writable: c.writable })) };
    }
    case 'list_events': {
      const now = new Date(NOW);
      const start = args.start ? new Date(args.start) : now;
      const end = args.end ? new Date(args.end) : new Date(now.getTime() + (args.days ? args.days : 7) * 86400000);
      const wantCal = args.calendar ? String(args.calendar).toLowerCase() : null;
      let rows = all().filter((e) => {
        const t = new Date(e.start);
        return t >= start && t <= end;
      });
      if (wantCal) rows = rows.filter((e) => String(e.calendar).toLowerCase() === wantCal);
      rows.sort(byStart);
      return { events: rows.slice(0, Math.min(args.limit || 50, 200)).map(listView) };
    }
    case 'search_events': {
      const q = String(args.query || '').toLowerCase();
      const hits = all().filter((e) => String(e.title).toLowerCase().includes(q));
      hits.sort(byStart);
      return { events: hits.slice(0, Math.min(args.limit || 30, 200)).map(searchView) };
    }
    case 'get_event': {
      const e = db.events[args.id];
      if (!e) throw new Error(`Event not found: ${args.id}`);
      return { event: eventView(e) };
    }
    case 'create_event': {
      if (!args.title) throw new Error('title is required');
      if (!args.start) throw new Error('start is required');
      let calendar = args.calendar;
      if (calendar) {
        const match = db.calendars.find((c) => c.name.toLowerCase() === String(calendar).toLowerCase());
        if (!match) throw new Error(`Calendar not found: ${calendar}`);
        calendar = match.name;
      } else {
        const writable = db.calendars.find((c) => c.writable) || db.calendars[0];
        calendar = writable ? writable.name : 'Work';
      }
      const startD = new Date(args.start);
      const endD = args.end ? new Date(args.end) : new Date(startD.getTime() + 3600000); // default 1h
      const id = `demo-${db.nextId++}`;
      db.events[id] = ev({
        id, title: String(args.title), calendar,
        start: startD.toISOString(), end: endD.toISOString(),
        all_day: args.all_day === true,
        location: args.location ? String(args.location) : '',
        notes: args.notes ? String(args.notes) : '',
      });
      await save(userId, db);
      return { event: eventView(db.events[id]) };
    }
    case 'update_event': {
      const e = db.events[args.id];
      if (!e) throw new Error(`Event not found: ${args.id}`);
      if (args.title !== undefined) e.title = String(args.title);
      if (args.start !== undefined) e.start = iso(args.start);
      if (args.end !== undefined) e.end = iso(args.end);
      if (args.location !== undefined) e.location = String(args.location);
      if (args.notes !== undefined) e.notes = String(args.notes);
      await save(userId, db);
      return { event: eventView(e) };
    }
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}
