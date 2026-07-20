// Unit tests for the pure functions in calendar-jxa.mjs — no osascript, no
// Calendar app. Run: node --test test-agent-unit.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJxaArgs, cleanOsascriptError, runTool } from './calendar-jxa.mjs';
import { buildPlist, xmlEscape } from './cli.mjs';

// The JXA programs receive their args verbatim as JSON argv, so buildJxaArgs is
// an identity passthrough — nothing is rewritten on the way to osascript.
test('buildJxaArgs passes read args through untouched', () => {
  const search = { query: 'q & <r>', limit: 5 };
  assert.deepEqual(buildJxaArgs('search_events', search), search);
  const get = { id: 'cal-1' };
  assert.deepEqual(buildJxaArgs('get_event', get), get);
  assert.deepEqual(buildJxaArgs('list_calendars', {}), {});
  assert.deepEqual(buildJxaArgs('list_events', { calendar: 'Work', days: 7 }), { calendar: 'Work', days: 7 });
});

test('buildJxaArgs passes write args through untouched', () => {
  const create = {
    title: 'Dinner', start: '2026-07-20T18:00:00Z', end: '2026-07-20T20:00:00Z',
    location: "Luigi's", notes: 'bring wine', calendar: 'Family', all_day: false,
  };
  assert.deepEqual(buildJxaArgs('create_event', create), create);
  const update = { id: 'cal-1', title: 'New title', start: '2026-07-20T09:00:00Z', location: 'Zoom' };
  assert.deepEqual(buildJxaArgs('update_event', update), update);
});

test('built args survive the JSON round-trip used for the argv handoff', () => {
  const out = buildJxaArgs('create_event', { title: `quote " tick ' back \\ slash`, notes: 'x\ny' });
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
});

test('cleanOsascriptError strips osascript noise', () => {
  assert.equal(
    cleanOsascriptError('execution error: Error: Event not found: abc (-2700)'),
    'Event not found: abc'
  );
  assert.equal(cleanOsascriptError('execution error: Application isn’t running. (-600)'), 'Application isn’t running.');
  assert.equal(cleanOsascriptError('plain failure'), 'plain failure');
  assert.equal(cleanOsascriptError(''), 'Calendar command failed');
});

test('runTool rejects unknown tools without spawning osascript', async () => {
  await assert.rejects(() => runTool('nope', {}), /Unknown tool: nope/);
});

test('xmlEscape escapes &, <, > for plist text nodes', () => {
  assert.equal(xmlEscape('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
  assert.equal(xmlEscape('/Users/me/App & Co'), '/Users/me/App &amp; Co');
  assert.equal(xmlEscape('plain/path'), 'plain/path');
});

test('buildPlist emits the correct label, ProgramArguments and KeepAlive', () => {
  const xml = buildPlist({
    label: 'com.calendarbridge.calendar-agent',
    nodePath: '/usr/local/bin/node',
    cliPath: '/Users/me/agent/cli.mjs',
    workingDir: '/Users/me',
    outLog: '/Users/me/Library/Logs/calendarbridge-agent.log',
    errLog: '/Users/me/Library/Logs/calendarbridge-agent.err.log',
  });
  assert.match(xml, /<key>Label<\/key>\s*<string>com\.calendarbridge\.calendar-agent<\/string>/);
  // ProgramArguments must be node, cli.mjs, run — in that order.
  assert.match(
    xml,
    /<string>\/usr\/local\/bin\/node<\/string>\s*<string>\/Users\/me\/agent\/cli\.mjs<\/string>\s*<string>run<\/string>/,
  );
  assert.match(xml, /<key>KeepAlive<\/key>\s*<true\/>/);
  assert.match(xml, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(xml, /<key>WorkingDirectory<\/key>\s*<string>\/Users\/me<\/string>/);
  assert.match(xml, /<key>StandardOutPath<\/key>\s*<string>\/Users\/me\/Library\/Logs\/calendarbridge-agent\.log<\/string>/);
  assert.match(xml, /<key>StandardErrorPath<\/key>\s*<string>\/Users\/me\/Library\/Logs\/calendarbridge-agent\.err\.log<\/string>/);
});

test('buildPlist starts with the standard plist XML/DOCTYPE header', () => {
  const xml = buildPlist({ label: 'x', nodePath: 'n', cliPath: 'c', workingDir: 'w', outLog: 'o', errLog: 'e' });
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<!DOCTYPE plist PUBLIC "-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN"/);
  assert.match(xml, /<plist version="1\.0">/);
});

test('buildPlist xml-escapes paths that contain special characters', () => {
  const xml = buildPlist({
    label: 'l', nodePath: 'n', cliPath: '/Users/me & co/cli.mjs', workingDir: 'w', outLog: 'o', errLog: 'e',
  });
  assert.match(xml, /<string>\/Users\/me &amp; co\/cli\.mjs<\/string>/);
  assert.ok(!xml.includes('me & co')); // a raw ampersand must never survive into the plist
});
