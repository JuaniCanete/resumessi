/**
 * tests/unit/escHtml.test.ts
 *
 * Unit tests for the escHtml utility function.
 * Uses Node.js native test runner (node:test + node:assert).
 *
 * NOTE: escHtml is currently inlined in public/main.html.
 * These tests mirror that implementation directly. When it is
 * extracted into public/utils.js (future refactor), update the import here.
 *
 * Photo priority: user-uploaded (localStorage) > resume data > demo fallback
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { escHtml } from '../../public/utils';

test('escHtml escapes < and > to numeric refs', () => {
  assert.equal(escHtml('<b>'), '&#60;b&#62;');
});

test('escHtml escapes & ampersand', () => {
  assert.equal(escHtml('a & b'), 'a &#38; b');
});

test('escHtml escapes double quotes', () => {
  assert.equal(escHtml('"hello"'), '&#34;hello&#34;');
});

test('escHtml escapes single quotes', () => {
  assert.equal(escHtml("it's"), 'it&#39;s');
});

test('escHtml escapes XSS payload', () => {
  const html = '<script>alert("xss")</script>';
  const expected = '&#60;script&#62;alert(&#34;xss&#34;)&#60;/script&#62;';
  assert.equal(escHtml(html), expected);
});

test('escHtml returns empty string unchanged', () => {
  assert.equal(escHtml(''), '');
});

test('escHtml returns empty string for null', () => {
  assert.equal(escHtml(null), '');
});

test('escHtml returns empty string for undefined', () => {
  assert.equal(escHtml(undefined), '');
});

test('escHtml leaves safe text unchanged', () => {
  assert.equal(escHtml('Hello World 123'), 'Hello World 123');
});
