# calendar-agent

The Mac-side half of **CalendarBridge** — it lets ChatGPT and Claude view, search, and
manage your **Apple Calendar**. This tiny agent runs on your Mac, connects to the
CalendarBridge relay, and does the actual talking to the Calendar app (via macOS
automation). Your events never leave your machine except for the specific request you make.

- No account, no password, no cloud copy of your calendar.
- One command to pair, one command to keep it running forever.
- No dependencies — just Node 18+.

---

## Quick start

You need [Node.js 18 or newer](https://nodejs.org). Then:

```sh
# 1. On the CalendarBridge site, click "Connect my Mac" to get a pairing code.
# 2. Pair this Mac (replace ABCD-1234 with your code):
npx calendar-agent pair ABCD-1234

# 3. Keep it running in the background — starts on login, restarts if it crashes:
npx calendar-agent install
```

That's it. You can close the terminal — the agent keeps running.

> **First run permission prompt:** the first time the agent touches Apple Calendar,
> macOS shows a one-time prompt asking to allow automation of "Calendar". Click **OK**.
> If you miss it, enable it later under
> **System Settings → Privacy & Security → Automation**. (Same one-time grant you'd
> give the Notes or Reminders apps.)

### Want it permanent? Install globally

`npx` runs from a cache that npm can prune, which would break the background agent.
For an always-on setup, install it globally so the path is stable:

```sh
npm install -g calendar-agent
calendar-agent pair ABCD-1234
calendar-agent install
```

---

## Commands

| Command | What it does |
|---|---|
| `calendar-agent pair <CODE>` | Claim a pairing code and save the agent token to `~/.calendarbridge-agent.json` (mode 600). |
| `calendar-agent install` | Install a macOS LaunchAgent so the agent auto-starts on login and restarts on crash. |
| `calendar-agent run` | Run the agent in the foreground (Ctrl-C to stop). `install` does this for you in the background. |
| `calendar-agent status` | Check that you're paired, the server is reachable, and whether auto-start is installed. |
| `calendar-agent logs` | Show the last ~50 lines of the background agent log. |
| `calendar-agent uninstall` | Stop and remove the background agent (LaunchAgent). |
| `calendar-agent --version` | Print the version. |
| `calendar-agent --help` | Show usage. |

All commands accept `--server <URL>` to point at a different relay
(default: `https://calendarbridge.vercel.app`).

---

## How it works

```
ChatGPT / Claude  ──MCP──▶  CalendarBridge relay  ◀──poll──  calendar-agent (your Mac)
                                                             │
                                                             ▼
                                                             Apple Calendar (JXA)
```

The agent long-polls the relay for jobs, runs each one against the Calendar app using
Apple's JavaScript automation (JXA / `osascript`, via the adapter `agent/calendar-jxa.mjs`),
and posts the result back. When there's nothing to do it just idles. It serves six tools:

| Tool | What it does |
|---|---|
| `list_calendars` | List your calendars — Work, Personal, Family, … (read-only). |
| `list_events` | Upcoming events in a date window (default: next 7 days), optionally scoped to one calendar (read-only). |
| `search_events` | Find events whose title contains a keyword (read-only). |
| `get_event` | Read a single event by id (read-only). |
| `create_event` | Create an event — title, start, end, optional location/notes/calendar/all-day. A write, confirmed by you in ChatGPT. |
| `update_event` | Edit an event's fields. **Overwrites the fields you pass** — read the event first. A confirmed write. |

They operate on your calendars, events, start/end times, all-day flag, location, and notes.

### Example asks

Once paired, in ChatGPT or Claude you can say things like:

- "List my calendars." → `list_calendars`
- "What's on my calendar this week?" → `list_events`
- "Find my event with 'dentist' in the title." → `search_events`
- "Add 'Team sync' Thursday 2–3pm to my Work calendar." → `create_event` (you confirm it)

- Config/token: `~/.calendarbridge-agent.json` (permissions `600`).
- Background logs: `~/Library/Logs/calendarbridge-agent.log` and `calendarbridge-agent.err.log`.
- LaunchAgent: `~/Library/LaunchAgents/com.calendarbridge.calendar-agent.plist`.

---

## Troubleshooting

**"Not paired" / it stopped working after a while.**
Your pairing token may have been revoked. Re-pair and reinstall:

```sh
calendar-agent pair <NEW-CODE>
calendar-agent install
```

If the background agent hit a `401`, it writes `~/.calendarbridge-agent.unauthorized`
and keeps the reason in the error log — check `calendar-agent logs`.

**Events aren't being read/written.**
Make sure the Calendar app is allowed under
**System Settings → Privacy & Security → Automation** (allow your terminal / `node`
to control **Calendar**). Then `calendar-agent uninstall` and `install` again.

**Check what's happening.**

```sh
calendar-agent status   # paired? reachable? auto-start installed?
calendar-agent logs     # recent activity + errors
```

**Uninstall completely.**

```sh
calendar-agent uninstall
rm ~/.calendarbridge-agent.json   # also forget the pairing token
```

**Non-macOS.** `install`/`uninstall`/`logs` are macOS-only (they use LaunchAgents).
`pair`, `run`, and `status` work anywhere Node runs, but the Calendar automation itself
requires macOS.

---

## Privacy

The agent only contacts the relay server you paired with. It sends the result of the
specific calendar operation you (via ChatGPT/Claude) requested — nothing else. Your
events are not uploaded or indexed anywhere.

## License

MIT © Isaiah Dupree
