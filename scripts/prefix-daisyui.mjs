#!/usr/bin/env node
/**
 * Prefix all daisyUI class tokens with du- (must match @plugin "daisyui" { prefix: du- }).
 * Run: node scripts/prefix-daisyui.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DAISY_PREFIX, isDaisyClassToken } from '../src/lib/daisyui-vocabulary.js';

const PREFIX = DAISY_PREFIX;

function prefixToken(token) {
	if (!isDaisyClassToken(token)) return token;
	return PREFIX + token;
}

function prefixClassString(classes) {
	return classes
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map(prefixToken)
		.join(' ');
}

/** Fix legacy non-daisy button classes before tokenization. */
function normalizeLegacyButtons(text) {
	return text.replace(/\bbtn ghost small\b/g, 'btn btn-ghost btn-sm');
}

function prefixClassAttributes(content) {
	return content.replace(/class="([^"]*)"/g, (_, classes) => {
		const normalized = normalizeLegacyButtons(classes);
		return `class="${prefixClassString(normalized)}"`;
	});
}

function prefixCssSelectors(css) {
	// Prefix only genuine daisyUI tokens (via prefixToken) in class selectors.
	// The leading `.` must sit in selector position (after whitespace, a
	// combinator, `(`, `[`, `#`, `,`, `.` or start) and the name must be
	// followed by a selector boundary (not `(`, so JS member calls like
	// `.filter(...)` are never matched). Custom classes that merely share a
	// root prefix (.drawer-nav, .status-row, .btn-icon) are left untouched.
	return css.replace(
		/(?<=[\s,.:#[(>+~]|^)\.(-?[A-Za-z_][\w-]*)(?=[\s,.:#)\]{}>+~]|$)/g,
		(_, name) => `.${prefixToken(name)}`
	);
}

/** Apply CSS-selector prefixing only inside Svelte `<style>` blocks. */
function prefixSvelteStyleBlocks(content) {
	return content.replace(
		/(<style[^>]*>)([\s\S]*?)(<\/style>)/g,
		(_, open, css, close) => open + prefixCssSelectors(css) + close
	);
}

function walk(dir, acc = []) {
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, name.name);
		if (name.isDirectory()) {
			if (name.name === 'node_modules' || name.name === '.git') continue;
			walk(p, acc);
		} else if (/\.(svelte|css)$/.test(name.name)) {
			acc.push(p);
		}
	}
	return acc;
}

const root = new URL('..', import.meta.url).pathname;
const files = walk(join(root, 'src')).concat([join(root, 'src', 'app.css')]);

let changed = 0;
for (const file of [...new Set(files)]) {
	let text = readFileSync(file, 'utf8');
	const orig = text;
	if (file.endsWith('.svelte')) {
		text = prefixClassAttributes(text);
		text = prefixSvelteStyleBlocks(text);
	} else if (file.endsWith('.css')) {
		text = prefixCssSelectors(text);
	}
	if (text !== orig) {
		writeFileSync(file, text);
		changed++;
		console.log('updated', file.replace(root, ''));
	}
}
console.log(`Done. ${changed} files updated.`);
