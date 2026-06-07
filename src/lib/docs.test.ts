import { describe, expect, it } from 'vitest';
import { parseGuideMarkdown } from './docs';

describe('parseGuideMarkdown', () => {
	it('parses headings, paragraphs, lists, links, inline code, and code fences', () => {
		const guide = parseGuideMarkdown(`# Guide

Intro with **strong text**, \`inline code\`, and [a link](/dashboard).

## Steps

1. Open the dashboard.
2. Press Replay.

\`\`\`bash
npm run check:docs -- origin/main
\`\`\`
`);

		expect(guide.title).toBe('Guide');
		expect(guide.blocks.map((block) => block.type)).toEqual([
			'heading',
			'paragraph',
			'heading',
			'list',
			'code'
		]);
		expect(guide.blocks[2]).toMatchObject({ type: 'heading', slug: 'steps' });
		expect(guide.blocks[3]).toMatchObject({
			type: 'list',
			ordered: true,
			items: expect.arrayContaining([
				expect.objectContaining({ children: [expect.objectContaining({ text: 'Open the dashboard.' })] })
			])
		});
		expect(guide.blocks[4]).toMatchObject({
			type: 'code',
			language: 'bash',
			code: 'npm run check:docs -- origin/main'
		});
	});

	it('normalizes unsafe relative links to an inert target', () => {
		const guide = parseGuideMarkdown('[bad](javascript:alert(1)) [ok](https://example.com)');
		const paragraph = guide.blocks[0];

		expect(paragraph).toMatchObject({ type: 'paragraph' });
		if (paragraph.type !== 'paragraph') throw new Error('expected paragraph');

		expect(paragraph.children).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: 'link', href: '#' }),
				expect.objectContaining({ type: 'link', href: 'https://example.com' })
			])
		);
	});
});
