export interface DiffSection {
	id: string;
	label: string;
	path: (string | number)[];
	oldRaw: unknown;
	newRaw: unknown;
	oldDisplay: string;
	newDisplay: string;
	accepted: boolean;
}

const collectionIdentityKeys: Record<string, string[]> = {
	experience: ['title', 'company'],
	education: ['institution', 'degree'],
	certifications: ['title'],
	talks: ['title'],
	projects: ['name'],
	languages: ['name'],
};

const BASICS_DIFF_KEYS = ['title', 'location', 'summary'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasValue(object: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(object, key);
}

export function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

function sameValue(left: unknown, right: unknown): boolean {
	return stableStringify(left) === stableStringify(right);
}

function titleCase(value: string): string {
	return value.replace(/[-_]/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function identityFor(collection: string, value: unknown, index: number): string {
	if (!isObject(value)) return `index:${index}`;
	const keys = collectionIdentityKeys[collection];
	if (!keys) {
		console.warn(
			`[polish-diff] Unknown collection "${collection}" - ` +
				'falling back to index-based identity. ' +
				'Add to collectionIdentityKeys for stable diffing.'
		);
		return `index:${index}`;
	}
	const identity = keys.map(key => String(value[key] ?? '').trim()).join('|');
	return identity.replace(/\|+$/, '') || `index:${index}`;
}

function entryLabel(collection: string, value: unknown, index: number, category?: string): string {
	if (!isObject(value)) return `${titleCase(collection)} ${index + 1}`;
	if (collection === 'experience') return `${value.title || 'Role'} at ${value.company || 'Company'}`;
	if (collection === 'education') return `${value.degree || 'Degree'} — ${value.institution || 'Institution'}`;
	if (collection === 'skills') return category ? `Skills: ${category}` : 'Skills';
	return String(value.title || value.name || `${titleCase(collection)} ${index + 1}`);
}

function slugId(raw: string): string {
	return raw.replace(/[^A-Za-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
}

function addSection(
	sections: DiffSection[],
	id: string,
	label: string,
	path: (string | number)[],
	oldRaw: unknown,
	newRaw: unknown
): void {
	sections.push({
		id: slugId(id),
		label,
		path,
		oldRaw,
		newRaw,
		oldDisplay: oldRaw === null ? '(New section)' : formatSectionForDisplay(String(path[0]), oldRaw),
		newDisplay: newRaw === null ? '(Removed)' : formatSectionForDisplay(String(path[0]), newRaw),
		accepted: false,
	});
}

function diffArray(sections: DiffSection[], key: string, oldValue: unknown[], newValue: unknown[]): void {
	const oldByIdentity = new Map<string, { value: unknown; index: number }>();
	const newByIdentity = new Map<string, { value: unknown; index: number }>();
	const oldCounts = new Map<string, number>();
	const newCounts = new Map<string, number>();
	oldValue.forEach((value, index) => {
		const base = identityFor(key, value, index);
		const n = oldCounts.get(base) ?? 0;
		oldCounts.set(base, n + 1);
		oldByIdentity.set(`${base}##${n}`, { value, index });
	});
	newValue.forEach((value, index) => {
		const base = identityFor(key, value, index);
		const n = newCounts.get(base) ?? 0;
		newCounts.set(base, n + 1);
		newByIdentity.set(`${base}##${n}`, { value, index });
	});

	const identities = new Set([...oldByIdentity.keys(), ...newByIdentity.keys()]);
	for (const identity of identities) {
		const oldEntry = oldByIdentity.get(identity);
		const newEntry = newByIdentity.get(identity);
		const index = oldEntry?.index ?? newEntry?.index ?? 0;
		if (!oldEntry || !newEntry || !sameValue(oldEntry.value, newEntry.value)) {
			addSection(
				sections,
				`${key}::${identity}`,
				entryLabel(key, newEntry?.value ?? oldEntry?.value, index),
				[key, oldEntry?.index ?? newEntry?.index ?? index],
				oldEntry?.value ?? null,
				newEntry?.value ?? null
			);
		}
	}
}

function diffSkills(sections: DiffSection[], oldValue: unknown, newValue: unknown): void {
	if (Array.isArray(oldValue) || Array.isArray(newValue)) {
		if (!sameValue(oldValue, newValue)) addSection(sections, 'skills', 'Skills', ['skills'], oldValue, newValue);
		return;
	}
	const oldMap = isObject(oldValue) ? oldValue : {};
	const newMap = isObject(newValue) ? newValue : {};
	const categories = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
	for (const category of categories) {
		const oldCategory = hasValue(oldMap, category) ? oldMap[category] : null;
		const newCategory = hasValue(newMap, category) ? newMap[category] : null;
		if (!sameValue(oldCategory, newCategory)) {
			addSection(
				sections,
				`skills::${category}`,
				`Skills: ${category}`,
				['skills', category],
				oldCategory,
				newCategory
			);
		}
	}
}

export function formatSectionForDisplay(sectionKey: string, value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) {
		if (value.every(item => typeof item === 'string')) return value.join(', ');
		if (value.every(item => isObject(item) && typeof item.name === 'string')) {
			return value.map(item => `  ${item.name}${item.expert ? ' (expert)' : ''}`).join('\n');
		}
		return value.map(item => formatSectionForDisplay(sectionKey, item)).join('\n');
	}
	if (isObject(value)) {
		if (sectionKey === 'experience' || ('title' in value && ('company' in value || 'highlights' in value))) {
			const title = value.title ? `${value.title}${value.company ? ` at ${value.company}` : ''}` : '';
			const date = value.date || [value.startDate, value.endDate].filter(Boolean).join(' – ');
			const description = value.description || '';
			const bullets = value.bullets || value.highlights;
			return [title, date, description, Array.isArray(bullets) ? bullets.map(item => `  - ${item}`).join('\n') : '']
				.filter(Boolean)
				.join('\n\n');
		}
		if ('degree' in value || 'institution' in value) {
			return [value.degree, value.institution, value.year || value.endDate].filter(Boolean).join('\n');
		}
		if ('issuer' in value || 'title' in value) {
			return [value.title || value.name, value.issuer, value.date].filter(Boolean).join('\n');
		}
		return JSON.stringify(value, null, 2);
	}
	return String(value);
}

export function computeDiff(original: Record<string, unknown>, polished: Record<string, unknown>): DiffSection[] {
	const sections: DiffSection[] = [];
	const keys = new Set([...Object.keys(original), ...Object.keys(polished)]);
	for (const key of keys) {
		const oldValue = hasValue(original, key) ? original[key] : null;
		const newValue = hasValue(polished, key) ? polished[key] : null;
		if (key === 'skills') {
			diffSkills(sections, oldValue, newValue);
		} else if (key === 'basics' && (isObject(oldValue) || isObject(newValue))) {
			const oldBasics = isObject(oldValue) ? oldValue : {};
			const newBasics = isObject(newValue) ? newValue : {};
			for (const nestedKey of new Set([...Object.keys(oldBasics), ...Object.keys(newBasics)])) {
				const oldNested = hasValue(oldBasics, nestedKey) ? oldBasics[nestedKey] : null;
				const newNested = hasValue(newBasics, nestedKey) ? newBasics[nestedKey] : null;
				if (
					!sameValue(oldNested, newNested) &&
					BASICS_DIFF_KEYS.includes(nestedKey as (typeof BASICS_DIFF_KEYS)[number])
				) {
					const label =
						nestedKey === 'title' ? 'Professional Title' : nestedKey === 'location' ? 'Location' : 'Summary';
					addSection(sections, `basics.${nestedKey}`, label, ['basics', nestedKey], oldNested, newNested);
				}
			}
		} else if (Array.isArray(oldValue) || Array.isArray(newValue)) {
			diffArray(sections, key, Array.isArray(oldValue) ? oldValue : [], Array.isArray(newValue) ? newValue : []);
		} else if (!sameValue(oldValue, newValue)) {
			const label =
				key === 'summary'
					? 'Summary'
					: key === 'title'
						? 'Professional Title'
						: key === 'location'
							? 'Location'
							: titleCase(key);
			addSection(sections, key, label, [key], oldValue, newValue);
		}
	}
	return sections;
}

export function mergeDiff(original: Record<string, unknown>, sections: DiffSection[]): Record<string, unknown> {
	const result = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;

	// Group accepted sections by collection key
	const byKey = new Map<string, DiffSection[]>();
	for (const section of sections) {
		if (!section.accepted) continue;
		const key = section.path[0] as string;
		if (!byKey.has(key)) byKey.set(key, []);
		byKey.get(key)!.push(section);
	}

	for (const [key, keySections] of byKey) {
		// Separate operations by path structure
		const topLevelOps = keySections.filter(s => s.path.length === 1);
		const stringOps = keySections.filter(s => s.path.length === 2 && typeof s.path[1] === 'string');
		const arrayOps = keySections.filter(s => s.path.length === 2 && typeof s.path[1] === 'number');

		// Handle top-level keys (summary, title, location, etc.)
		for (const section of topLevelOps) {
			if (section.newRaw === null) delete result[key];
			else result[key] = section.newRaw;
		}

		// Handle string-keyed collections (skills, etc.)
		for (const section of stringOps) {
			const collection = isObject(result[key]) ? result[key] : {};
			const path1 = section.path[1] as string;
			if (section.newRaw === null) delete collection[path1];
			else collection[path1] = section.newRaw;
			result[key] = collection;
		}

		if (arrayOps.length === 0) continue;

		const collection = Array.isArray(result[key]) ? result[key] : [];

		// 1. Apply updates (newRaw !== null && oldRaw !== null) first
		const updates = arrayOps.filter(s => s.newRaw !== null && s.oldRaw !== null);
		for (const section of updates) {
			collection[section.path[1] as number] = section.newRaw;
		}

		// 2. Apply removals (newRaw === null) in descending index order
		const removals = arrayOps
			.filter(s => s.newRaw === null)
			.sort((a, b) => (b.path[1] as number) - (a.path[1] as number));
		for (const section of removals) {
			collection.splice(section.path[1] as number, 1);
		}

		// 3. Apply additions (newRaw !== null && oldRaw === null) in ascending index order
		const additions = arrayOps
			.filter(s => s.newRaw !== null && s.oldRaw === null)
			.sort((a, b) => (a.path[1] as number) - (b.path[1] as number));
		for (const section of additions) {
			const index = section.path[1] as number;
			if (index >= collection.length) collection.push(section.newRaw);
			else collection.splice(index, 0, section.newRaw);
		}

		result[key] = collection;
	}

	return result;
}
