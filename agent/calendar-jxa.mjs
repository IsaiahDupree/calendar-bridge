// calendar-jxa.mjs — runs CalendarBridge tools against the real Apple Calendar app.
//
// Each tool is a complete JXA program executed via `osascript -l JavaScript -e`.
// Args travel as one JSON string in argv (execFile, no shell) — never interpolated
// into the source — and every program prints JSON on stdout.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const JOB_TIMEOUT_MS = 45_000; // Calendar AppleEvents can be slow; leave headroom under the relay's 50s

// Args pass through untouched — the JXA programs receive them verbatim as JSON argv.
export function buildJxaArgs(tool, args = {}) {
  return args;
}

// osascript stderr looks like "execution error: Error: <msg> (-1700)".
export function cleanOsascriptError(msg) {
  const s = String(msg || '').trim();
  const m = s.match(/execution error:\s*(?:Error:\s*)?([\s\S]*?)(?:\s*\(-?\d+\))?$/);
  return (m && m[1].trim()) || s || 'Calendar command failed';
}

// Shared JXA helpers: default date window, ISO formatting, event serialization,
// and a cross-calendar event lookup by uid.
const HELPERS = `
function safe(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }
function iso(d) { return (d && d.toISOString) ? d.toISOString() : null; }
function eventOut(e) {
  return {
    id: safe(function () { return e.uid(); }, ''),
    title: safe(function () { return e.summary(); }, ''),
    start: safe(function () { return iso(e.startDate()); }, null),
    end: safe(function () { return iso(e.endDate()); }, null),
    all_day: safe(function () { return e.alldayEvent(); }, false),
    location: safe(function () { return e.location() || ''; }, ''),
    notes: safe(function () { return e.description() || ''; }, ''),
    calendar: safe(function () { return e.calendar().name(); }, '')
  };
}
function findEventByUid(app, uid) {
  var cals = app.calendars();
  for (var i = 0; i < cals.length; i++) {
    try { var hits = cals[i].events.whose({ uid: uid }); if (hits.length > 0) return hits[0]; } catch (e) {}
  }
  return null;
}
function calendarByName(app, name) {
  var want = String(name).toLowerCase();
  var cals = app.calendars();
  for (var i = 0; i < cals.length; i++) {
    try { if (cals[i].name().toLowerCase() === want) return cals[i]; } catch (e) {}
  }
  return null;
}
`;

const SOURCES = {
  list_calendars: `
function run() {
  var app = Application('Calendar');
  var cals = app.calendars();
  var out = [];
  for (var i = 0; i < cals.length; i++) {
    try { out.push({ name: cals[i].name(), writable: (function(){ try { return cals[i].writable(); } catch(e){ return true; } })() }); } catch (e) {}
  }
  return JSON.stringify({ calendars: out });
}
`,

  list_events: HELPERS + `
function run(argv) {
  var args = JSON.parse(argv[0]);
  var now = new Date();
  var start = args.start ? new Date(args.start) : now;
  var end = args.end ? new Date(args.end) : new Date(now.getTime() + (args.days ? args.days : 7) * 86400000);
  var limit = Math.min(args.limit || 50, 200);
  var wantCal = args.calendar ? String(args.calendar).toLowerCase() : null;
  var app = Application('Calendar');
  var cals = app.calendars();
  var rows = [];
  for (var i = 0; i < cals.length; i++) {
    var cname = '';
    try { cname = cals[i].name(); } catch (e) { continue; }
    if (wantCal && cname.toLowerCase() !== wantCal) continue;
    try {
      var evs = cals[i].events.whose({ _and: [ { startDate: { _greaterThanEquals: start } }, { startDate: { _lessThanEquals: end } } ] });
      var uids = evs.uid();
      var sums = evs.summary();
      var starts = evs.startDate();
      var ends = evs.endDate();
      var locs = evs.location();
      for (var j = 0; j < uids.length; j++) {
        rows.push({
          id: uids[j], title: sums[j],
          start: starts[j] ? starts[j].toISOString() : null,
          end: ends[j] ? ends[j].toISOString() : null,
          location: locs[j] || '', calendar: cname
        });
      }
    } catch (e) {}
  }
  rows.sort(function (a, b) { var as = a.start || '9999', bs = b.start || '9999'; return as < bs ? -1 : as > bs ? 1 : 0; });
  return JSON.stringify({ events: rows.slice(0, limit) });
}
`,

  search_events: HELPERS + `
function run(argv) {
  var args = JSON.parse(argv[0]);
  var q = String(args.query || '').toLowerCase();
  var limit = Math.min(args.limit || 30, 200);
  // Bound the scan so a huge calendar can't hang: default a wide window around now.
  var now = new Date();
  var start = args.start ? new Date(args.start) : new Date(now.getTime() - 90 * 86400000);
  var end = args.end ? new Date(args.end) : new Date(now.getTime() + 365 * 86400000);
  var app = Application('Calendar');
  var cals = app.calendars();
  var rows = [];
  for (var i = 0; i < cals.length && rows.length < limit; i++) {
    var cname = '';
    try { cname = cals[i].name(); } catch (e) { continue; }
    try {
      var evs = cals[i].events.whose({ _and: [ { startDate: { _greaterThanEquals: start } }, { startDate: { _lessThanEquals: end } } ] });
      var uids = evs.uid(); var sums = evs.summary(); var starts = evs.startDate(); var locs = evs.location();
      for (var j = 0; j < uids.length && rows.length < limit; j++) {
        if (String(sums[j]).toLowerCase().indexOf(q) !== -1) {
          rows.push({ id: uids[j], title: sums[j], start: starts[j] ? starts[j].toISOString() : null, location: locs[j] || '', calendar: cname });
        }
      }
    } catch (e) {}
  }
  rows.sort(function (a, b) { var as = a.start || '9999', bs = b.start || '9999'; return as < bs ? -1 : as > bs ? 1 : 0; });
  return JSON.stringify({ events: rows });
}
`,

  get_event: HELPERS + `
function run(argv) {
  var args = JSON.parse(argv[0]);
  var app = Application('Calendar');
  var e = findEventByUid(app, args.id);
  if (!e) throw new Error('Event not found: ' + args.id);
  return JSON.stringify({ event: eventOut(e) });
}
`,

  create_event: HELPERS + `
function run(argv) {
  var args = JSON.parse(argv[0]);
  if (!args.title) throw new Error('title is required');
  if (!args.start) throw new Error('start is required');
  var app = Application('Calendar');
  var target = args.calendar ? calendarByName(app, args.calendar) : null;
  if (args.calendar && !target) throw new Error('Calendar not found: ' + args.calendar);
  if (!target) {
    // first writable calendar as the default
    var cals = app.calendars();
    for (var i = 0; i < cals.length; i++) { try { if (cals[i].writable()) { target = cals[i]; break; } } catch (e) {} }
    if (!target && cals.length) target = cals[0];
  }
  if (!target) throw new Error('No writable calendar available');
  var startD = new Date(args.start);
  var endD = args.end ? new Date(args.end) : new Date(startD.getTime() + 3600000); // default 1h
  var props = { summary: String(args.title), startDate: startD, endDate: endD };
  if (args.all_day === true) props.alldayEvent = true;
  if (args.location) props.location = String(args.location);
  if (args.notes) props.description = String(args.notes);
  var ev = app.Event(props);
  target.events.push(ev);
  return JSON.stringify({ event: eventOut(ev) });
}
`,

  update_event: HELPERS + `
function run(argv) {
  var args = JSON.parse(argv[0]);
  var app = Application('Calendar');
  var e = findEventByUid(app, args.id);
  if (!e) throw new Error('Event not found: ' + args.id);
  if (args.title !== undefined) e.summary = String(args.title);
  if (args.start !== undefined) e.startDate = new Date(args.start);
  if (args.end !== undefined) e.endDate = new Date(args.end);
  if (args.location !== undefined) e.location = String(args.location);
  if (args.notes !== undefined) e.description = String(args.notes);
  return JSON.stringify({ event: eventOut(e) });
}
`,
};

export async function runTool(tool, args = {}) {
  const source = SOURCES[tool];
  if (!source) throw new Error(`Unknown tool: ${tool}`);
  const payload = JSON.stringify(buildJxaArgs(tool, args));
  let stdout;
  try {
    ({ stdout } = await exec('osascript', ['-l', 'JavaScript', '-e', source, payload], {
      timeout: JOB_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: 32 * 1024 * 1024,
    }));
  } catch (err) {
    if (err.killed || err.signal) throw new Error('timed out on the Mac');
    throw new Error(cleanOsascriptError(err.stderr || err.message));
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Bad JXA output for ${tool}: ${String(stdout).slice(0, 200)}`);
  }
}
