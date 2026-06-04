#!/usr/bin/env node
/**
 * Ensures every bundled locale has the same dot-path keys as English.
 * Run after adding strings to en.ts or a new locale file.
 */
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const localesDir = new URL('../src/lib/locales/', import.meta.url);

function flatten(obj, prefix = '') {
	const keys = [];
	for (const [k, v] of Object.entries(obj)) {
		const path = prefix ? `${prefix}.${k}` : k;
		// Only recurse into real (non-null) objects; treat strings and any stray
		// null/primitive value as a leaf so a malformed entry can't crash the
		// script with `Object.entries(null)` — it'll surface as a key diff instead.
		if (v && typeof v === 'object') keys.push(...flatten(v, path));
		else keys.push(path);
	}
	return keys;
}

const { en } = await import(new URL('./en.ts', localesDir));
const enKeys = new Set(flatten(en));

const localeFiles = readdirSync(localesDir).filter(
	(f) =>
		f.endsWith('.ts') &&
		!f.endsWith('.test.ts') &&
		f !== 'en.ts' &&
		f !== 'index.ts' &&
		f !== 'types.ts'
);

let failed = false;

for (const file of localeFiles) {
	const code = file.replace(/\.ts$/, '');
	const mod = await import(new URL(`./${file}`, localesDir));
	const dict = mod[code];
	if (!dict) {
		console.error(`locale ${file}: expected export const ${code}`);
		failed = true;
		continue;
	}
	const keys = new Set(flatten(dict));
	const missing = [...enKeys].filter((k) => !keys.has(k));
	const extra = [...keys].filter((k) => !enKeys.has(k));
	if (missing.length || extra.length) {
		failed = true;
		console.error(`locale ${code}: missing ${missing.length}, extra ${extra.length}`);
		if (missing.length) console.error('  missing:', missing.slice(0, 8).join(', '));
		if (extra.length) console.error('  extra:', extra.slice(0, 8).join(', '));
	}
}

if (failed) process.exit(1);
console.log(`locales ok: ${enKeys.size} keys × ${localeFiles.length + 1} languages`);
