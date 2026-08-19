import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Two ways to reach the org, in priority order:
//   1. SALESFORCE_INSTANCE_URL + SALESFORCE_ACCESS_TOKEN — the REST path, for a
//      deployed backend where no CLI exists.
//   2. The Salesforce CLI's own session (`sf org login web`) — the path this
//      repo's seed scripts already use, so a developer who can run
//      scripts/salesforce-seed.mjs needs no extra configuration.
// No credential is read from or written to the repository. The CLI path never
// handles the access token at all: `sf org display` redacts it by design, so
// queries are executed by the CLI rather than by lifting its session.

const alias = () => process.env.SALESFORCE_ORG_ALIAS || 'trial';

// The CLI ships its own node; a stale NODE_OPTIONS preload in the parent shell
// crashes it, so start every child from a clean slate.
function cliEnv() {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  return env;
}

function restConfig() {
  const instanceUrl = process.env.SALESFORCE_INSTANCE_URL;
  const accessToken = process.env.SALESFORCE_ACCESS_TOKEN;
  if (!instanceUrl || !accessToken) return null;
  return { instanceUrl: instanceUrl.replace(/\/$/, ''), accessToken };
}

/** Where the org lives and how we are talking to it — for the /integrations probe. */
export async function salesforceAuth() {
  const rest = restConfig();
  if (rest) return { instanceUrl: rest.instanceUrl, via: 'env (REST token)' };
  const { stdout } = await run('sf', ['org', 'display', '--target-org', alias(), '--json'], { env: cliEnv(), maxBuffer: 10 * 1024 * 1024 });
  const result = JSON.parse(stdout).result || {};
  if (!result.instanceUrl) throw new Error(`Salesforce CLI org "${alias()}" has no active session`);
  if (result.connectedStatus && result.connectedStatus !== 'Connected') {
    throw new Error(`Salesforce CLI org "${alias()}" is ${result.connectedStatus}`);
  }
  return { instanceUrl: result.instanceUrl.replace(/\/$/, ''), via: `sf cli (${alias()})` };
}

async function soqlViaRest(query, rest) {
  const response = await fetch(`${rest.instanceUrl}/services/data/v61.0/query?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${rest.accessToken}` },
  });
  if (!response.ok) throw new Error(`Salesforce query failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

async function soqlViaCli(query) {
  const { stdout } = await run(
    'sf',
    ['data', 'query', '--target-org', alias(), '--query', query, '--json'],
    { env: cliEnv(), maxBuffer: 64 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout);
  if (parsed.status !== 0) throw new Error(`Salesforce query failed: ${parsed.message || 'unknown CLI error'}`);
  return parsed.result || { records: [], done: true };
}

export async function soql(query) {
  const rest = restConfig();
  return rest ? soqlViaRest(query, rest) : soqlViaCli(query);
}

/** Follow `nextRecordsUrl` so a book larger than one REST page comes back whole. */
export async function soqlAll(query) {
  const rest = restConfig();
  if (!rest) return (await soqlViaCli(query)).records || []; // the CLI already pages
  let body = await soqlViaRest(query, rest);
  const records = [...(body.records || [])];
  while (!body.done && body.nextRecordsUrl) {
    const response = await fetch(`${rest.instanceUrl}${body.nextRecordsUrl}`, { headers: { Authorization: `Bearer ${rest.accessToken}` } });
    if (!response.ok) throw new Error(`Salesforce paging failed (${response.status})`);
    body = await response.json();
    records.push(...(body.records || []));
  }
  return records;
}
