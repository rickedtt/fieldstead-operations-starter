import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_ICON_SIZES,
  parseIcoDirectory,
  validateWindowsIcon,
} from '../scripts/validate-windows-icon.mjs';

describe('Windows icon contract', () => {
  it('uses the approved source and embeds every required square size', async () => {
    const [icon, source] = await Promise.all([
      readFile(new URL('../build/icon.ico', import.meta.url)),
      readFile(new URL('../build/icon-source.jpg', import.meta.url)),
    ]);

    expect(validateWindowsIcon({ icon, source })).toEqual([]);
    expect(parseIcoDirectory(icon).map(({ width }) => width)).toEqual(EXPECTED_ICON_SIZES);
  });

  it('rejects a changed source and malformed ICO', () => {
    expect(validateWindowsIcon({ icon: Buffer.from('not an icon'), source: Buffer.from('changed') }))
      .toEqual(expect.arrayContaining([
        expect.stringContaining('approved source image'),
        expect.stringContaining('ICO header'),
      ]));
  });
});
