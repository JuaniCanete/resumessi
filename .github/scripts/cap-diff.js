#!/usr/bin/env node
'use strict';

// Caps a unified diff at CAP bytes on a clean hunk boundary.
// Used by .github/workflows/opencode.yml (both jobs) so the review prompt
// stays bounded. Pure functions are unit-tested in tests/unit/cap-diff.test.ts.

const fs = require('node:fs');

const CAP_DEFAULT = 60 * 1024;
const TRUNCATED_SUFFIX = omitted => `\n[DIFF TRUNCATED — ${omitted} bytes omitted; review only the shown hunks]`;

// Cut str to at most cap bytes without splitting a UTF-8 sequence or a
// UTF-16 surrogate pair (iterates code points, accounts bytes exactly).
function capUtf8(str, cap) {
	let bytes = 0;
	let end = 0;
	for (const ch of str) {
		const size = Buffer.byteLength(ch, 'utf8');
		if (bytes + size > cap) break;
		bytes += size;
		end += ch.length;
	}
	return str.slice(0, end);
}

function capDiff(raw, cap = CAP_DEFAULT) {
	if (Buffer.byteLength(raw, 'utf8') <= cap) return { text: raw, truncated: false, omitted: 0 };
	let cut = capUtf8(raw, cap);
	const boundary = Math.max(cut.lastIndexOf('\ndiff --git '), cut.lastIndexOf('\n@@ '));
	if (boundary > 0) cut = cut.slice(0, boundary);
	const omitted = Buffer.byteLength(raw, 'utf8') - Buffer.byteLength(cut, 'utf8');
	return { text: cut + TRUNCATED_SUFFIX(omitted), truncated: true, omitted };
}

function main() {
	const [input = '/tmp/diff_raw.txt', output = '/tmp/diff_capped.txt', capArg] = process.argv.slice(2);
	const cap = capArg ? Number(capArg) : CAP_DEFAULT;
	const raw = fs.readFileSync(input, 'utf8');
	fs.writeFileSync(output, capDiff(raw, cap).text);
}

if (require.main === module) main();

module.exports = { capDiff, capUtf8, CAP_DEFAULT };
