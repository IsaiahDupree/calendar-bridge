<div align="center">

# 📅 CalendarBridge

**Your Apple Calendar, in ChatGPT — on your own Mac.**

[![License: MIT](https://img.shields.io/badge/License-MIT-f5b942.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/calendar-agent.svg?color=4ade80&label=calendar-agent)](https://www.npmjs.com/package/calendar-agent)

</div>

CalendarBridge is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) connector that lets ChatGPT work with your **Apple Calendar**. Reads execute locally and requested results pass through the authenticated relay — every action runs on **your own Mac** through a tiny local agent. The cloud piece is only a stateless relay that shuttles requests between ChatGPT and your Mac.

```
  ChatGPT  ──OAuth──►  CalendarBridge relay  ──job queue──►  calendar-agent  ──►  Calendar.app
 (connector)          (Vercel, stateless)      (your Mac, polls & executes)     (on your Mac)
```

Your Mac is the only place your events are ever read or written. The relay stores only short-lived job payloads and your account record; it never sees an event unless a job is in flight, and jobs expire in seconds.

---

## For users — 3 steps

**1. Create your account** at **[calendarbridge.vercel.app](https://calendarbridge.vercel.app)** and generate a pairing code.

**2. Install the Mac agent** (needs [Node 18+](https://nodejs.org)):

```bash
npx calendar-agent pair <YOUR-CODE>   # link this Mac to your account
npx calendar-agent install            # keep it running on every restart
```

The first time it touches Calendar, macOS asks **"Terminal wants to control Calendar"** — click **OK** (one time).

**3. Connect ChatGPT:** Settings → **Plugins** → turn on **Developer mode** (Security & login) → **Create** a custom plugin → paste the MCP Server URL **`https://calendarbridge.vercel.app/mcp`** → Authentication **OAuth** → sign in & **Allow**.

That's it. In a new chat: *"Search my Apple Calendar for the dentist appointment"* or *"Add a Team Standup to my Work calendar tomorrow at 9am."*

> Your Mac must be awake with the agent running. `npx calendar-agent install` makes it start automatically at login and restart if it ever crashes.

### Managing the agent

```bash
npx calendar-agent status      # is it paired & reachable?
npx calendar-agent logs        # recent activity
npx calendar-agent uninstall   # stop auto-start
```

---

## What ChatGPT can do

| Tool | Action |
|------|--------|
| `list_calendars` | List all your calendars (Work, Personal, Family, …) |
| `list_events` | List upcoming events in a date window (default next 7 days), optionally one calendar |
| `search_events` | Find events whose title contains a keyword |
| `get_event` | Read one event by id |
| `create_event` | Create an event (title, start, end, optional location, notes, calendar, all-day) |
| `update_event` | Edit an event's fields (overwrites the fields you pass — read it first) |

---

## Self-hosting

You can run your own relay so nothing depends on the hosted instance.

**Prereqs:** a [Vercel](https://vercel.com) account and a [Supabase](https://supabase.com) project (free tiers are fine).

1. **Storage** — in your Supabase project's SQL editor, run [`supabase/schema.sql`](./supabase/schema.sql). It creates a tiny Redis-shaped KV + queue surface (`nb_*` functions) with RLS on.
2. **Deploy** the `server/` directory to Vercel.
3. **Set env vars** (see [`server/.env.example`](./server/.env.example)):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — your project + service-role key
   - `JWT_SECRET` — `openssl rand -hex 32`
4. **Verify:** `curl https://YOUR-APP.vercel.app/api/health` → `redisConfigured`, `redisOk`, `jwtSecretSet` all `true`.
5. Point the agent at it: `npx calendar-agent pair <CODE> --server https://YOUR-APP.vercel.app`.

---

## How it works

- **Auth** — OAuth 2.1 with PKCE and Dynamic Client Registration (RFC 7591). ChatGPT registers itself, the user signs in on the CalendarBridge consent page, and ChatGPT gets a scoped MCP access token. JWTs are HMAC-signed; three kinds (`session`, `agent`, `mcp`) with distinct privileges. Optional email verification via Resend (`RESEND_API_KEY`); off unless configured, and enforcement is opt-in (`REQUIRE_EMAIL_VERIFICATION`).
- **Relay** — MCP tool call → job pushed to `jobs:<user>` (TTL ≤ the caller's wait window, so an abandoned job can't run late) → the Mac agent (holding a hanging long-poll) is handed the job within ~200ms, executes it, pushes the result → the MCP handler returns it. The long-poll means jobs are delivered on arrival rather than on a fixed interval, so relay overhead is ~300ms instead of ~1s. The agent is considered "online" only while it's actively connected.
- **Agent** — a dependency-free Node CLI. Tools run via JXA (`osascript -l JavaScript`) against Calendar.app; arguments are passed as JSON over argv (never shell-interpolated). A macOS LaunchAgent keeps it alive across logins and crashes.

## Repository layout

```
server/    Vercel functions: OAuth + MCP endpoint + relay        (deploy this)
agent/     calendar-agent — the npm-published Mac CLI                 (users npx this)
kit/       Browser automations: register the dev-mode connector AND
           fill the OpenAI directory submission (see kit/README.md)
supabase/  schema.sql for self-hosting the storage
test/      end-to-end OAuth + MCP integration test
```

## Development

```bash
# server
cd server && cp .env.example .env.local   # fill in, then: vercel dev
# end-to-end test against a live deployment (reads ../.env.local)
node test/e2e-oauth.mjs
# agent unit tests
node --test agent/test-agent-unit.mjs
```

## Security & privacy

- Events are read/written **only on your Mac**. The relay temporarily stores requested content in short-lived job/result queues — job payloads live in Redis-shaped storage with a short TTL and are deleted on delivery.
- The agent token is stored at `~/.calendarbridge-agent.json` (mode `600`).
- No secrets are committed; see [`.gitignore`](./.gitignore) and the `.env.example` files.
- Write tools are marked destructive so ChatGPT asks before changing an event.

## License

[MIT](./LICENSE) © Isaiah Dupree

## Production storage and owner verification

Relay 1.4 uses isolated service-role-only tables/functions on the configured shared Supabase project. Production refuses missing storage configuration, bounds RPC requests to ten seconds, and returns HTTP 503 when storage or signing configuration is unavailable. Apply the checked-in isolated-storage migration before deploying this version; it does not replace another bridge's account tables or functions.

`node --env-file=.env.local test/live-storage.mjs` verifies the actual persistent store, FIFO, expiry and counters using temporary integration keys. `BRIDGE_SESSION_FILE=/private/owner-session.json BRIDGE_READ_TOOL=READ_TOOL node test/live-relay.mjs` verifies the actual owner session, PKCE OAuth, hosted MCP and paired-Mac read; choose this bridge's inventory tool. No reviewer data counts as a live acceptance. Credentials and sessions belong outside Git.
