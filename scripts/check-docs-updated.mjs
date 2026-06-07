#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const baseRef =
	process.argv[2] ??
	process.env.DOCS_BASE_REF ??
	(process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main');

const docsPaths = [
	'docs/',
	'README.md',
	'AGENTS.md',
	'CLAUDE.md',
	'GEMINI.md',
	'.kiro/steering/',
	'.kiro/specs/',
	'.github/pull_request_template.md'
];

function git(args) {
	return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function gitList(args) {
	const output = git(args);
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
}

function refExists(ref) {
	try {
		git(['rev-parse', '--verify', ref]);
		return true;
	} catch {
		return false;
	}
}

function docFile(path) {
	return docsPaths.some((docPath) => path === docPath || path.startsWith(docPath));
}

if (!refExists(baseRef) && baseRef.startsWith('origin/')) {
	const branch = baseRef.slice('origin/'.length);
	git(['fetch', 'origin', `${branch}:refs/remotes/origin/${branch}`]);
}

const mergeBase = git(['merge-base', baseRef, 'HEAD']);
const changed = [
	...new Set([
		...gitList(['diff', '--name-only', `${mergeBase}...HEAD`]),
		...gitList(['diff', '--name-only', 'HEAD']),
		...gitList(['ls-files', '--others', '--exclude-standard'])
	])
];

if (changed.length === 0) {
	console.log('docs gate: no changed files');
	process.exit(0);
}

const docsChanged = changed.filter(docFile);
const nonDocsChanged = changed.filter((path) => !docFile(path));

if (nonDocsChanged.length > 0 && docsChanged.length === 0) {
	console.error('docs gate: non-doc files changed without a documentation update');
	console.error('');
	console.error('Update docs/usage.md, README.md, or the relevant .kiro docs in the same PR.');
	console.error('');
	console.error('Non-doc files:');
	for (const path of nonDocsChanged) console.error(`- ${path}`);
	process.exit(1);
}

console.log(
	`docs gate: ok (${docsChanged.length} doc file${docsChanged.length === 1 ? '' : 's'}, ${nonDocsChanged.length} non-doc file${nonDocsChanged.length === 1 ? '' : 's'})`
);
