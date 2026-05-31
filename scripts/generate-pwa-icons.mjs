/**
 * One-off generator for PWA icons (192 + 512, standard + maskable).
 * Run: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const staticDir = join(root, 'static');
const svg = readFileSync(join(staticDir, 'favicon.svg'));

const sizes = [192, 512];

async function renderIcon(size, maskable) {
	const pad = maskable ? Math.round(size * 0.1) : 0;
	const inner = size - pad * 2;
	const icon = await sharp(svg).resize(inner, inner).png().toBuffer();
	if (!pad) {
		return sharp(icon).png().toBuffer();
	}
	return sharp({
		create: {
			width: size,
			height: size,
			channels: 4,
			background: { r: 241, g: 235, b: 223, alpha: 1 }
		}
	})
		.composite([{ input: icon, left: pad, top: pad }])
		.png()
		.toBuffer();
}

for (const size of sizes) {
	await sharp(await renderIcon(size, false))
		.toFile(join(staticDir, `icon-${size}.png`));
	await sharp(await renderIcon(size, true))
		.toFile(join(staticDir, `icon-${size}-maskable.png`));
}

console.log('Wrote icon-192*.png and icon-512*.png to static/');
