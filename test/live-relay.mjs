// Actual owner OAuth -> hosted MCP -> paired Mac read. Never accepts demo output.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(process.env.BRIDGE_SESSION_FILE, 'utf8'));
const post = async (path, body, token) => {
  const response = await fetch(config.server + path, { method: 'POST', signal: AbortSignal.timeout(65_000),
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  const text = await response.text(), data = text.match(/^data: (.*)$/m);
  return JSON.parse(data ? data[1] : text);
};
const meResponse = await fetch(config.server + '/api/me', { headers: { authorization: `Bearer ${config.token}` } });
const me = await meResponse.json();
assert.equal(me.email, 'isaiahdupree33@gmail.com'); assert.equal(me.demo, false);
const callback = 'https://chatgpt.com/connector_platform_oauth_redirect';
const registered = await post('/api/oauth/register', { redirect_uris: [callback], client_name: 'Owner read-only live verification' });
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const authorized = await post('/api/oauth/authorize', { client_id: registered.client_id, redirect_uri: callback, code_challenge: challenge, code_challenge_method: 'S256' }, config.token);
const exchanged = await post('/api/oauth/token', { grant_type: 'authorization_code', code: new URL(authorized.redirect).searchParams.get('code'), code_verifier: verifier, redirect_uri: callback });
const mcp = (method, params, id = 1) => post('/mcp', { jsonrpc: '2.0', id, method, params }, exchanged.access_token);
const initialized = await mcp('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'owner-live-validation', version: '1.0' }, capabilities: {} });
assert.ok(initialized.result?.serverInfo);
const listed = await mcp('tools/list', {}); assert.ok(listed.result?.tools?.length);
const tool = process.env.BRIDGE_READ_TOOL;
assert.ok(['list_calendars','list_lists','list_folders','list_sources'].includes(tool));
const called = await mcp('tools/call', { name: tool, arguments: {} });
assert.ok(!called.error && !called.result?.isError, 'Real paired-Mac read must succeed: ' + (called.error?.message || called.result?.content?.find(c => c.type === 'text')?.text || '').slice(0,300));
const payload = called.result?.content?.find(c => c.type === 'text')?.text;
const read = JSON.parse(payload);
const count = tool === 'list_sources' ? read.total_notes : (read.calendars || read.lists || read.folders)?.length;
assert.ok(Number.isSafeInteger(count), 'Expected actual inventory');
console.log(JSON.stringify({ origin: config.server, email: me.email, demo: false, oauth_pkce: true, mcp_tools: listed.result.tools.length, read_tool: tool, inventory_count: count }));
