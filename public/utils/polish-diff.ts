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

function sameValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function titleCase(value: string): string {
	return value.replace(/[-_]/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function identityFor(collection: string, value: unknown, index: number): string {
	if (!isObject(value)) return `index:${index}`;
	const keys = collectionIdentityKeys[collection];
	if (!keys) return `index:${index}`;
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

function addSection(
	sections: DiffSection[],
	id: string,
	label: string,
	path: (string | number)[],
	oldRaw: unknown,
	newRaw: unknown
): void {
	sections.push({
		id,
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
	oldValue.forEach((value, index) => oldByIdentity.set(identityFor(key, value, index), { value, index }));
	newValue.forEach((value, index) => newByIdentity.set(identityFor(key, value, index), { value, index }));

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
	for (const section of sections) {
		if (!section.accepted) continue;
		const [key, indexOrCategory] = section.path;
		if (typeof indexOrCategory === 'string') {
			const collection = isObject(result[key]) ? result[key] : {};
			if (section.newRaw === null) delete collection[indexOrCategory];
			else collection[indexOrCategory] = section.newRaw;
			result[key] = collection;
			continue;
		}
		if (typeof indexOrCategory === 'number') {
			const collection = Array.isArray(result[key]) ? result[key] : [];
			if (section.newRaw === null) collection.splice(indexOrCategory, 1);
			else if (indexOrCategory < collection.length) collection[indexOrCategory] = section.newRaw;
			else collection.push(section.newRaw);
			result[key] = collection;
			continue;
		}
		if (section.newRaw === null) delete result[key];
		else result[key] = section.newRaw;
	}
	return result;
}
