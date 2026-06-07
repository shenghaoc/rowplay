export type InlineNode =
	| { id: string; type: 'text'; text: string }
	| { id: string; type: 'code'; text: string }
	| { id: string; type: 'strong'; children: InlineNode[] }
	| { id: string; type: 'link'; href: string; children: InlineNode[] };

export type MarkdownBlock =
	| { id: string; type: 'heading'; depth: 1 | 2 | 3; slug: string; children: InlineNode[] }
	| { id: string; type: 'paragraph'; children: InlineNode[] }
	| { id: string; type: 'quote'; children: InlineNode[] }
	| { id: string; type: 'list'; ordered: boolean; items: MarkdownListItem[] }
	| { id: string; type: 'code'; language: string; code: string };

export type MarkdownListItem = {
	id: string;
	children: InlineNode[];
};

export type MarkdownDocument = {
	title: string | null;
	blocks: MarkdownBlock[];
};

const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const UNORDERED_RE = /^-\s+(.+)$/;
const ORDERED_RE = /^\d+\.\s+(.+)$/;

export function parseGuideMarkdown(markdown: string): MarkdownDocument {
	const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
	const blocks: MarkdownBlock[] = [];
	const slugCounts = new Map<string, number>();
	let idCounter = 0;
	let index = 0;

	const nextId = (prefix: string) => `${prefix}-${idCounter++}`;

	const addText = (nodes: InlineNode[], text: string) => {
		if (!text) return;
		const previous = nodes.at(-1);
		if (previous?.type === 'text') previous.text += text;
		else nodes.push({ id: nextId('inline'), type: 'text', text });
	};

	const parseInline = (input: string): InlineNode[] => {
		const nodes: InlineNode[] = [];
		let cursor = 0;

		while (cursor < input.length) {
			const nextCode = input.indexOf('`', cursor);
			const nextStrong = input.indexOf('**', cursor);
			const nextLink = input.indexOf('[', cursor);
			const markers = [nextCode, nextStrong, nextLink].filter((position) => position >= 0);
			const nextMarker = markers.length ? Math.min(...markers) : -1;

			if (nextMarker === -1) {
				addText(nodes, input.slice(cursor));
				break;
			}

			addText(nodes, input.slice(cursor, nextMarker));

			if (nextMarker === nextCode) {
				const end = input.indexOf('`', nextMarker + 1);
				if (end === -1) {
					addText(nodes, input.slice(nextMarker));
					break;
				}
				nodes.push({ id: nextId('inline'), type: 'code', text: input.slice(nextMarker + 1, end) });
				cursor = end + 1;
				continue;
			}

			if (nextMarker === nextStrong) {
				const end = input.indexOf('**', nextMarker + 2);
				if (end === -1) {
					addText(nodes, input.slice(nextMarker, nextMarker + 2));
					cursor = nextMarker + 2;
					continue;
				}
				nodes.push({
					id: nextId('inline'),
					type: 'strong',
					children: parseInline(input.slice(nextMarker + 2, end))
				});
				cursor = end + 2;
				continue;
			}

			const closeBracket = input.indexOf(']', nextMarker + 1);
			if (closeBracket === -1 || input[closeBracket + 1] !== '(') {
				addText(nodes, input[nextMarker]);
				cursor = nextMarker + 1;
				continue;
			}

			const closeParen = input.indexOf(')', closeBracket + 2);
			if (closeParen === -1) {
				addText(nodes, input[nextMarker]);
				cursor = nextMarker + 1;
				continue;
			}

			nodes.push({
				id: nextId('inline'),
				type: 'link',
				href: normalizeHref(input.slice(closeBracket + 2, closeParen).trim()),
				children: parseInline(input.slice(nextMarker + 1, closeBracket))
			});
			cursor = closeParen + 1;
		}

		return nodes;
	};

	const slugFor = (text: string) => {
		const base =
			text
				.toLowerCase()
				.replace(/`([^`]+)`/g, '$1')
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '') || 'section';
		const count = slugCounts.get(base) ?? 0;
		slugCounts.set(base, count + 1);
		return count === 0 ? base : `${base}-${count + 1}`;
	};

	while (index < lines.length) {
		const line = lines[index];

		if (!line.trim()) {
			index += 1;
			continue;
		}

		if (line.startsWith('```')) {
			const language = line.slice(3).trim();
			const codeLines: string[] = [];
			index += 1;
			while (index < lines.length && !lines[index].startsWith('```')) {
				codeLines.push(lines[index]);
				index += 1;
			}
			if (index < lines.length) index += 1;
			blocks.push({
				id: nextId('block'),
				type: 'code',
				language,
				code: codeLines.join('\n')
			});
			continue;
		}

		const heading = HEADING_RE.exec(line);
		if (heading) {
			const text = heading[2].trim();
			blocks.push({
				id: nextId('block'),
				type: 'heading',
				depth: heading[1].length as 1 | 2 | 3,
				slug: slugFor(text),
				children: parseInline(text)
			});
			index += 1;
			continue;
		}

		const unordered = UNORDERED_RE.exec(line);
		const ordered = ORDERED_RE.exec(line);
		if (unordered || ordered) {
			const listOrdered = Boolean(ordered);
			const matcher = listOrdered ? ORDERED_RE : UNORDERED_RE;
			const items: MarkdownListItem[] = [];
			while (index < lines.length) {
				const match = matcher.exec(lines[index]);
				if (!match) break;
				items.push({ id: nextId('item'), children: parseInline(match[1].trim()) });
				index += 1;
			}
			blocks.push({ id: nextId('block'), type: 'list', ordered: listOrdered, items });
			continue;
		}

		if (line.startsWith('>')) {
			const quoteLines: string[] = [];
			while (index < lines.length && lines[index].startsWith('>')) {
				quoteLines.push(lines[index].replace(/^>\s?/, '').trim());
				index += 1;
			}
			blocks.push({
				id: nextId('block'),
				type: 'quote',
				children: parseInline(quoteLines.join(' '))
			});
			continue;
		}

		const paragraphLines: string[] = [];
		while (index < lines.length && lines[index].trim()) {
			if (
				HEADING_RE.test(lines[index]) ||
				lines[index].startsWith('```') ||
				UNORDERED_RE.test(lines[index]) ||
				ORDERED_RE.test(lines[index]) ||
				lines[index].startsWith('>')
			) {
				break;
			}
			paragraphLines.push(lines[index].trim());
			index += 1;
		}
		blocks.push({
			id: nextId('block'),
			type: 'paragraph',
			children: parseInline(paragraphLines.join(' '))
		});
	}

	const firstHeading = blocks.find(
		(block): block is Extract<MarkdownBlock, { type: 'heading' }> =>
			block.type === 'heading' && block.depth === 1
	);
	return {
		title: firstHeading ? plainText(firstHeading.children) : null,
		blocks
	};
}

function normalizeHref(href: string) {
	if (/^(https?:\/\/|\/|#)/.test(href)) return href;
	return '#';
}

function plainText(nodes: InlineNode[]): string {
	return nodes
		.map((node) => {
			if (node.type === 'strong' || node.type === 'link') return plainText(node.children);
			return node.text;
		})
		.join('');
}
