/**
 * tests/unit/extraction.test.ts
 *
 * Unit tests for the extractNameFromPDFText function.
 * This function is inlined in public/main.html and used during AI resume
 * generation to validate candidate identity.
 *
 * Tests cover:
 * - Name extraction from various text formats
 * - Ignoring headers, contact info, and other non-name lines
 * - Handling edge cases (empty text, no valid name found)
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mirror of the extraction logic from public/main.html (lines 2069-2084).
 * @param {string} text - The PDF text to extract name from
 * @returns {string|null} - The extracted name or null
 */
function extractNameFromPDFText(text) {
  if (!text) return null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 3 || line.length > 60) continue;
    if (/^(email|phone|location|linkedin|github|http|www|@)/i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      if (/^[a-zA-Z�-���'. -]+$/.test(line) && !/\d/.test(line)) {
        return line;
      }
    }
  }
  return null;
}

// ── Basic Name Extraction ──────────────────────────────────────────────

test('extractNameFromPDFText returns null for empty text', () => {
  assert.equal(extractNameFromPDFText(''), null);
});

test('extractNameFromPDFText returns null for null input', () => {
  assert.equal(extractNameFromPDFText(null), null);
});

test('extractNameFromPDFText returns null for undefined input', () => {
  assert.equal(extractNameFromPDFText(undefined), null);
});

test('extractNameFromPDFText extracts simple name from beginning of text', () => {
  const text = `John Smith
Software Engineer
Email: john@example.com`;
  assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText extracts name with accented characters', () => {
  const text = `Jos� Garc�a
Engineer
Location: Madrid`;
  assert.equal(extractNameFromPDFText(text), 'Jos� Garc�a');
});

test('extractNameFromPDFText extracts name with single quotes and hyphens', () => {
  const text = `Mary-Jane O'Connor
Developer`;
  assert.equal(extractNameFromPDFText(text), "Mary-Jane O'Connor");
});

// ── Filtering Rules ────────────────────────────────────────────────────

test('extractNameFromPDFText ignores email lines', () => {
  const text = `john@example.com
John Smith`;
  assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText ignores phone lines', () => {
  const text = `Phone: +1-555-000-0000
Jane Doe`;
  assert.equal(extractNameFromPDFText(text), 'Jane Doe');
});

test('extractNameFromPDFText ignores location lines', () => {
  const text = `Location: New York, NY
John Doe`;
  assert.equal(extractNameFromPDFText(text), 'John Doe');
});

test('extractNameFromPDFText ignores LinkedIn/GitHub lines', () => {
  const text = `https://linkedin.com/in/johndoe
John Doe`;
  assert.equal(extractNameFromPDFText(text), 'John Doe');
});

test('extractNameFromPDFText ignores lines with numbers', () => {
  const text = `John123 Smith
Jane Smith`;
  assert.equal(extractNameFromPDFText(text), 'Jane Smith');
});

test('extractNameFromPDFText ignores single-word lines', () => {
  const text = `Resume
John Smith`;
  assert.equal(extractNameFromPDFText(text), 'John Smith');
});

// ── Edge Cases ───────────────────────────────────────────────────────────

test('extractNameFromPDFText ignores lines longer than 60 characters', () => {
  const longLine = 'A'.repeat(61);
  const text = `${longLine}
John Smith`;
  assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText ignores lines shorter than 3 characters', () => {
  const text = `AB
John Smith`;
  assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText returns first valid name found', () => {
  const text = `First Person
Second Person
Third Person`;
  assert.equal(extractNameFromPDFText(text), 'First Person');
});

test('extractNameFromPDFText handles whitespace correctly', () => {
  const text = `   John   Smith  
Software Engineer`;
  assert.equal(extractNameFromPDFText(text), 'John   Smith');
});

test('extractNameFromPDFText ignores lines starting with @ symbol', () => {
  const text = `@username
John Smith`;
  assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText ignores www prefix lines', () => {
  const text = `www.example.com
John Smith`;
  assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText returns null when no valid name found', () => {
  const text = `john@example.com
Phone: 555-1234
Location: NYC
https://github.com`;
  assert.equal(extractNameFromPDFText(text), null);
});
