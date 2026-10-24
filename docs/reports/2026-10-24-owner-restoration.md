# CalendarBridge owner restoration — 2026-10-24

## Implemented and deployed

- Relay 1.4 uses service-specific storage tables and RPC functions on the required shared Supabase project. RLS is enabled and public/anon/authenticated grants are revoked; service_role alone has access. No other bridge's tables/functions were replaced.
- Production refuses missing persistent storage configuration. RPC requests are bounded to ten seconds. Health reports HTTP 503 when storage or signing configuration is unavailable. The production deployment passed a health check with all checks true.
- The owner account is registered as isaiahdupree33@gmail.com, is non-demo, and passes actual production password login. A separate random32-character password is saved and encrypted-save verified in the existing KeePass vault. No credential values are stored in this report or Git. Email delivery is not configured in these deployments: the existing application marks the account verified automatically; no inbox-verification claim is made.
- The owner Mac is paired, and the agent is installed as a login LaunchAgent. Job logs no longer print private tool arguments.
- Agent and server test suites pass. The real storage integration verifies persistent get/set, FIFO, counter and expiry using temporary integration keys and cleanup.

## Acceptance still in progress

Browser reconnect, refreshed tool definitions and installed-plugin data reads are being verified separately. Intermittent production RPC timeouts and native macOS permission prompts were observed and are not counted as successful data reads.

The installed ChatGPT account reconnect completed and tools were refreshed. Calendar native reads returned seven calendars after the observed macOS permission flow; the daemon has its separate node-to-Calendar grant. Installed tool read acceptance is still being checked.
