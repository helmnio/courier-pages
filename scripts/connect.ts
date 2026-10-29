import { clientStatuses, connectClient, type ClientId } from '../server/connect.js';
import { dataDirectory, root } from '../server/paths.js';
/**
 * npm run connect            show which AI clients are connected
 * npm run connect -- --all   connect every detected client that needs it
 * npm run connect -- claude-code codex
 */
const args = process.argv.slice(2);
const mark = { connected: '✓', outdated: '!', 'not-connected': '·', 'not-detected': '–' } as const;
const wording = {
  connected: 'connected',
  outdated: 'connected, but points at an old location',
  'not-connected': 'not connected',
  'not-detected': 'not found on this computer',
} as const;
function show() {
  console.log(`Courier Pages installed at ${root}`);
  console.log(`Screenplays are saved in ${dataDirectory}\n`);
  for (const c of clientStatuses())
    console.log(`  ${mark[c.state]} ${c.label}: ${wording[c.state]}`);
}
const wanted = args.includes('--all')
  ? clientStatuses()
      .filter((c) => c.state === 'not-connected' || c.state === 'outdated')
      .map((c) => c.id)
  : (args.filter((a) => !a.startsWith('--')) as ClientId[]);
if (!wanted.length) {
  show();
  if (!args.length) console.log('\nRun "npm run connect -- --all" to connect everything found.');
} else {
  for (const id of wanted) {
    const label = clientStatuses().find((c) => c.id === id)?.label ?? id;
    const result = connectClient(id);
    console.log(`${result.ok ? '✓' : '✗'} ${label}: ${result.message}`);
    if (result.command) console.log(`    ${result.command}`);
  }
  console.log('');
  show();
}
