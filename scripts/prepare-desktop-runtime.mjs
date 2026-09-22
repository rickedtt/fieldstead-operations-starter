import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(root, 'lib/mail-provider.ts'), 'utf8');
const runtime = source.replaceAll(/export function /g, 'function ').replaceAll(/export const /g, 'const ') + '\nexport { detectMailProvider, getMailProviderProfile, normalizeMailProvider };\n';
await fs.writeFile(path.join(root, 'lib/mail-provider-runtime.mjs'), runtime);
