import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const SCRIPT = join(__dirname, '..', '..', '.github', 'scripts', 'cap-diff.js');

function runCli(input: string, cap?: number): string {
	const dir = mkdtempSync(join(tmpdir(), 'cap-diff-'));
	const inputPath = join(dir, 'in.txt');
	const outputPath = join(dir, 'out.txt');
	writeFileSync(inputPath, input);
	const args = cap === undefined ? [inputPath, outputPath] : [inputPath, outputPath, String(cap)];
	execFileSync(process.execPath, [SCRIPT, ...args], { stdio: 'pipe' });
	return readFileSync(outputPath, 'utf8');
}

test('small diff passes through byte-identical (multibyte intact)', () => {
	const input = 'diff --git a/f.ts b/f.ts\n@@ -1 +1 @@\n-old\n+new with caf\u00e9 and \u{1F600}\n';
	assert.equal(runCli(input), input);
});

test('giant single-line hunk keeps maximal content instead of dropping to header', () => {
	const input = `diff --git a/big.ts b/big.ts\n@@ -1 +1 @@\n${'x'.repeat(70000)}\n`;
	const output = runCli(input);
	assert.ok(output.endsWith('[DIFF TRUNCATED — 8602 bytes omitted; review only the shown hunks]'));
	assert.ok(Buffer.byteLength(output, 'utf8') > 60000);
});

test('multi-file diff over cap cuts at the file boundary, first file intact', () => {
	const first = 'diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n-old\n+new\n';
	const input = `${first}diff --git a/b.ts b/b.ts\n@@ -1 +1 @@\n${'y'.repeat(70000)}\n`;
	const output = runCli(input);
	assert.ok(output.startsWith(first));
	assert.ok(output.includes('[DIFF TRUNCATED'));
});

test('cut never splits a multibyte sequence (no replacement char)', () => {
	// Fill so the 64-byte cap lands mid-emoji run.
	const input = `diff --git a/e.ts b/e.ts\n@@ -1 +1 @@\n${'\u{1F600}'.repeat(50)}\n`;
	const output = runCli(input, 64);
	assert.ok(!output.includes('�'));
	assert.ok(output.includes('[DIFF TRUNCATED'));
});
