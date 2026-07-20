// mcpTools.js — the MCP server exposed to ChatGPT. Every tool forwards to the
// paired Mac agent through the relay; the agent does the actual Calendar work.
// (Tool names match the agent's calendar-jxa executor keys 1:1.)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { enqueueJob } from './relay.js';
import { demoExec } from './demoStore.js';

const asText = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const asError = (err) => ({
  isError: true,
  content: [{ type: 'text', text: `Error: ${err.message || String(err)}` }],
});

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function buildServer(userId, { demo = false } = {}) {
  const server = new McpServer({ name: 'calendar-relay', version: '1.0.0' });

  // Demo accounts run against a server-side sample calendar (no Mac agent needed);
  // real accounts relay to the user's paired Mac.
  const exec = demo ? (tool, args) => demoExec(userId, tool, args) : (tool, args) => enqueueJob(userId, tool, args);
  const forward = (tool) => async (args) => {
    try {
      return asText(await exec(tool, args ?? {}));
    } catch (e) {
      return asError(e);
    }
  };

  server.registerTool(
    'list_calendars',
    {
      title: 'List calendars',
      description: "List the user's Apple Calendar calendars (Work, Personal, Family, …) and whether each is writable.",
      inputSchema: {},
      annotations: RO,
    },
    forward('list_calendars')
  );

  server.registerTool(
    'list_events',
    {
      title: 'List events',
      description: "List upcoming events in a date window (defaults to the next 7 days), soonest first. Optionally limit to one calendar, or pass an explicit start/end (ISO 8601).",
      inputSchema: {
        calendar: z.string().optional(),
        days: z.number().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: RO,
    },
    forward('list_events')
  );

  server.registerTool(
    'search_events',
    {
      title: 'Search events',
      description: "Find events whose title contains a keyword. Returns matching events with ids; use get_event to read one.",
      inputSchema: { query: z.string(), limit: z.number().optional() },
      annotations: RO,
    },
    forward('search_events')
  );

  server.registerTool(
    'get_event',
    {
      title: 'Read an event',
      description: 'Read the full details of one event by id (from list_events or search_events): title, start/end, all-day, location, notes, calendar.',
      inputSchema: { id: z.string() },
      annotations: RO,
    },
    forward('get_event')
  );

  server.registerTool(
    'create_event',
    {
      title: 'Create an event',
      description: "Create a new calendar event. start (and optional end) are ISO 8601, e.g. 2026-07-20T09:00:00Z; end defaults to one hour after start. Optionally set location, notes, all_day, and a target calendar (defaults to the first writable calendar).",
      inputSchema: {
        title: z.string(),
        start: z.string(),
        end: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
        calendar: z.string().optional(),
        all_day: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    forward('create_event')
  );

  server.registerTool(
    'update_event',
    {
      title: 'Update an event',
      description: "Edit an event's title, start, end, location, or notes. WARNING: overwrites the fields you pass — read it first with get_event.",
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    forward('update_event')
  );

  return server;
}
