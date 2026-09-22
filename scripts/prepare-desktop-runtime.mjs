import fs from 'node:fs/promises';
const source = await fs.readFile('lib/mail-provider.ts', 'utf8');
const runtime = source.replaceAll(/export function /g, 'function ').replaceAll(/export const /g, 'const ') + '\nexport { detectMailProvider, getMailProviderProfile, normalizeMailProvider };\n';
await fs.writeFile('dist/standalone/mail-provider-runtime.mjs', runtime);
