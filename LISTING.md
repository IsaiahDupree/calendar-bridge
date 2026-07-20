# CalendarBridge — paste-ready submission answers

Fill the OpenAI plugin submission form (platform.openai.com/plugins → **Create
plugin** → **With MCP**) with the values below. Fields verified against the live
portal on 2026-07-17. Requires developer identity verification first (see
SUBMISSION.md).

---

## Connection

| Field | Value |
|---|---|
| MCP Server URL | `https://calendarbridge.vercel.app/mcp` |
| Authentication | OAuth |
| OAuth — the portal auto-discovers these from the URL's `/.well-known` metadata | authorization: `https://calendarbridge.vercel.app/oauth/authorize` · token: `https://calendarbridge.vercel.app/api/oauth/token` · registration (DCR): `https://calendarbridge.vercel.app/api/oauth/register` · PKCE S256 · scope `calendar` |

After entering the URL, click **Scan Tools** — it should discover all 6 tools.

## Listing (App Info section — exact fields on the live form)

| Field | Value |
|---|---|
| **Name** | CalendarBridge |
| **Subtitle** ⚠️ ≤30 chars | `Apple Calendar in ChatGPT` |
| **Category** | Productivity |
| **Developer Identity** | Business — Dupree Ops LLC *(the verified identity; requires ID verification first)* |
| **Plugin Author** | Isaiah Dupree |
| **Website URL** | `https://calendarbridge.vercel.app` |
| **Customer support URL** | `https://calendarbridge.vercel.app/support` |
| **Privacy policy URL** | `https://calendarbridge.vercel.app/privacy` |
| **Terms of Service URL** | `https://calendarbridge.vercel.app/terms` |
| **Demo Recording URL** ⚠️ required | *(a hosted screen-recording of the plugin working — you must record this)* |
| **Directory icon / composer icon** | `assets/icon-512.png` (512×512 PNG) |
| **Commerce & Purchasing** | leave unchecked (free — no purchases) |

**Description:**
> CalendarBridge connects ChatGPT to the calendars on your Mac. Browse your calendars, see what's coming up, search events by title, read the full details of any event, create new events with times and locations, or edit an existing one — all from a chat. Your calendar never lives on our servers: every action is executed on your own Mac by a small open-source agent you install with one command (`npx calendar-agent`), and the relay only carries each request for the seconds it's in flight. Write actions are always confirmed by you in ChatGPT before they happen. Open source (MIT) and self-hostable.

*These values are also encoded in [`kit/submission.config.json`](./kit/submission.config.json), which `kit/submit-plugin.mjs` fills automatically.*

## Demo / reviewer account (no MFA)

> This connector normally relays to the user's own Mac. For review, sign in with
> the account below — it runs every tool against a built-in server-side sample
> calendar, so all 6 tools work 24/7 with no desktop app or pairing required. The
> demo calendar has three calendars (**Work**, **Personal**, **Family**) seeded
> with Team Standup, Design Review, Q3 Planning offsite, Gym, Dentist, Soccer
> practice, and Mom's birthday dinner.

- Email: `reviewer@calendarbridge.demo`
- Password: *(the `DEMO_PASSWORD` value in `.env.local` — paste it here at submission)*

## Test prompts & expected responses

Sign in as the reviewer account, add the connector via OAuth, then:

1. **"List my Apple Calendars"** → `list_calendars` →
   `{ "calendars": [ { "name": "Work" }, { "name": "Personal" }, { "name": "Family" } ] }`
2. **"What's on my calendar this week?"** → `list_events` →
   `{ "events": [ { "id": "demo-1", "title": "Team Standup", "calendar": "Work", "start": "2026-07-20T09:00" }, { "id": "demo-2", "title": "Design Review", "calendar": "Work", "start": "2026-07-21T14:00" }, { "id": "demo-5", "title": "Dentist", "calendar": "Personal", "start": "2026-07-23T10:30" }, { "id": "demo-7", "title": "Mom's birthday dinner", "calendar": "Family", "start": "2026-07-24T19:00" } ] }`
3. **"Search my calendar for the dentist appointment"** → `search_events` (keyword `dentist`) → `{ "results": [ { "id": "demo-5", "title": "Dentist" } ] }`; follow with **"Open that one"** → `get_event` (id `demo-5`) → returns its start/end, calendar (`Personal`), location, and notes.
4. **"Add 'Coffee with Alex' to my Personal calendar tomorrow from 3 to 3:30pm"** → `create_event` →
   `{ "event": { "id": "demo-8", "title": "Coffee with Alex", "calendar": "Personal", "start": "2026-07-20T15:00", "end": "2026-07-20T15:30" } }` (ChatGPT confirms before writing)
5. **"Move my Dentist appointment to 11am"** → `update_event` (id `demo-5`) →
   `{ "event": { "id": "demo-5", "title": "Dentist", "start": "2026-07-23T11:00", "end": "2026-07-23T11:30" } }` (ChatGPT confirms before writing; update overwrites only the fields you pass)

## Negative test cases (exactly 3 — prompts where CalendarBridge should NOT trigger)

1. **A reminders / notes action** — *"Add 'buy oat milk' to my shopping reminders."* —
   CalendarBridge works only with Apple Calendar events, not Reminders, to-do lists, or notes.
2. **A different calendar app** — *"Add this to my Google Calendar."* — CalendarBridge only
   works with the Apple Calendar on your Mac, not Google Calendar / Outlook / Fantastical.
3. **An abstract scheduling question** — *"What's a good way to time-block my week?"* —
   general productivity advice, no action on the user's own Apple Calendar.

## Release notes (first release)

> Initial release. CalendarBridge connects ChatGPT to your Apple Calendar through a
> small open-source agent that runs on your own Mac — browse your calendars, see
> what's coming up, search events by title, read any event's details, create new
> events with times and locations, or edit an existing one. Every write is confirmed
> by you before it happens. Your events never live on our servers; the cloud piece is
> only a stateless relay. Open source (MIT) and self-hostable.

## Tools declared (6)

`list_calendars`, `list_events`, `search_events`, `get_event`, `create_event`,
`update_event` (the write tools `create_event` and `update_event` are annotated
destructive → ChatGPT confirms before changing an event).
