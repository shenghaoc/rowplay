#!/usr/bin/env node
/**
 * Prefix all daisyUI class tokens with du- (must match @plugin "daisyui" { prefix: du- }).
 * Run: node scripts/prefix-daisyui.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PREFIX = 'du-';

/** daisyUI v5 component roots — see .kiro/skills/daisyui/SKILL.md */
const DAISY_ROOTS = [
	'accordion',
	'alert',
	'avatar',
	'badge',
	'breadcrumbs',
	'btn',
	'calendar',
	'card',
	'carousel',
	'chat',
	'checkbox',
	'collapse',
	'countdown',
	'diff',
	'divider',
	'dock',
	'drawer',
	'dropdown',
	'fab',
	'fieldset',
	'file-input',
	'filter',
	'footer',
	'hero',
	'indicator',
	'input',
	'join',
	'kbd',
	'label',
	'link',
	'list',
	'loading',
	'mask',
	'menu',
	'modal',
	'navbar',
	'pagination',
	'progress',
	'radio',
	'range',
	'rating',
	'select',
	'skeleton',
	'stack',
	'stat',
	'stats',
	'status',
	'steps',
	'swap',
	'tab',
	'table',
	'tabs',
	'textarea',
	'timeline',
	'toast',
	'toggle',
	'tooltip',
	'validator',
	'theme-controller'
];

const ROOT_SET = new Set(DAISY_ROOTS);

function isDaisyToken(token) {
	if (token.startsWith(PREFIX)) return false;
	if (ROOT_SET.has(token)) return true;
	for (const r of DAISY_ROOTS) {
		if (token.startsWith(`${r}-`)) return true;
	}
	return false;
}

function prefixToken(token) {
	if (!isDaisyToken(token)) return token;
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

function prefixCssSelectors(content) {
	let out = content;
	// Longest roots first to avoid partial replacements
	const sorted = [...DAISY_ROOTS].sort((a, b) => b.length - a.length);
	for (const root of sorted) {
		// .btn-primary, .btn:hover, :not(.btn), .btn-disabled
		const re = new RegExp(`(?<=[\\s,.:#[(]|^)\\.(${root})(?=-|[\\s,.:#)\\]{}>+~]|$)`, 'g');
		out = out.replace(re, `.${PREFIX}$1`);
		// :not(.btn)
		const reNot = new RegExp(`:not\\(\\.(${root})\\)`, 'g');
		out = out.replace(reNot, `:not(.${PREFIX}$1)`);
	}
	return out;
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
	}
	if (file.endsWith('.css') || file.endsWith('.svelte')) {
		// Svelte scoped CSS blocks
		text = prefixCssSelectors(text);
	}
	if (text !== orig) {
		writeFileSync(file, text);
		changed++;
		console.log('updated', file.replace(root, ''));
	}
}
console.log(`Done. ${changed} files updated.`);
