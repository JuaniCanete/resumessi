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

test('large diff truncates at a clean boundary with byte-exact omitted count', () => {
	const input = `diff --git a/big.ts b/big.ts\n@@ -1 +1 @@\n${'x'.repeat(70000)}\n`;
	const output = runCli(input);
	assert.ok(output.endsWith('[DIFF TRUNCATED — 70014 bytes omitted; review only the shown hunks]'));
	assert.ok(Buffer.byteLength(output, 'utf8') < 70000);
});

test('cut never splits a multibyte sequence (no replacement char)', () => {
	// Fill so the 64-byte cap lands mid-emoji run.
	const input = `diff --git a/e.ts b/e.ts\n@@ -1 +1 @@\n${'\u{1F600}'.repeat(50)}\n`;
	const output = runCli(input, 64);
	assert.ok(!output.includes('�'));
	assert.ok(output.includes('[DIFF TRUNCATED'));
});
