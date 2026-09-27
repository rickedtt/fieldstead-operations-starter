import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(root, 'lib/mail-provider.ts'), 'utf8');
const runtime = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: 'mail-provider.ts',
  reportDiagnostics: true,
});

if (runtime.diagnostics?.length) {
  const diagnostics = ts.formatDiagnostics(runtime.diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  });
  throw new Error(`Could not generate desktop mail-provider runtime:\n${diagnostics}`);
}

await fs.writeFile(path.join(root, 'lib/mail-provider-runtime.mjs'), runtime.outputText);
