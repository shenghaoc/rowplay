import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { ja } from './ja';
import { zh } from './zh';

function flattenDict(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
	const map = new Map<string, string>();
	for (const [k, v] of Object.entries(obj)) {
		const path = prefix ? `${prefix}.${k}` : k;
		if (typeof v === 'string') {
			map.set(path, v);
		} else if (v && typeof v === 'object') {
			for (const [subKey, subVal] of flattenDict(v as Record<string, unknown>, path)) {
				map.set(subKey, subVal);
			}
		}
	}
	return map;
}

export const dictionaries = { en, zh, de, es, fr, ja } as const;

export type LocaleCode = keyof typeof dictionaries;

const flatDictionaries = Object.fromEntries(
	Object.entries(dictionaries).map(([code, dict]) => [code, flattenDict(dict)])
) as Record<LocaleCode, Map<string, string>>;

export function getValue(language: LocaleCode, key: string): string | undefined {
	return flatDictionaries[language]?.get(key);
}
