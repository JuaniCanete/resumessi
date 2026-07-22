/**
 * tests/unit/getPhotoPath.test.js
 *
 * Unit tests for the getPhotoPath logic from public/main.html.
 *
 * NOTE: getPhotoPath is currently inlined in public/main.html.
 * These tests mirror that implementation directly. When it is
 * extracted into public/utils.js (future refactor), update the import here.
 *
 * Photo priority: user-uploaded (localStorage) > resume data > demo fallback
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mirror of the photo resolution logic from public/main.html.
 * @param {object|null} uploadedPhoto - base64 data URL from localStorage, or null
 * @param {object} resumeData - parsed resume JSON
 * @returns {string} resolved photo path or data URL
 */
import { getPhotoPath } from '../../public/utils';

test('getPhotoPath returns uploaded photo when present', () => {
  const uploadedPhoto = 'data:image/png;base64,abc';
  const resumeData = { basics: { photo: 'photo.jpg' } };
  assert.equal(getPhotoPath(uploadedPhoto, resumeData), 'data:image/png;base64,abc');
});

test('getPhotoPath returns resume photo path when no upload', () => {
  const resumeData = { basics: { photo: 'myphoto.jpg' } };
  assert.equal(getPhotoPath(null, resumeData), 'public/assets/photos/myphoto.jpg');
});

test('getPhotoPath returns demo fallback when basics.photo is missing', () => {
  const resumeData = { basics: {} };
  assert.equal(getPhotoPath(null, resumeData), '/examples/photo.jpg');
});

test('getPhotoPath returns demo fallback when basics is missing entirely', () => {
  const resumeData = {};
  assert.equal(getPhotoPath(null, resumeData), '/examples/photo.jpg');
});

test('getPhotoPath uploaded photo takes priority over resume photo', () => {
  const uploadedPhoto = 'data:image/jpeg;base64,xyz';
  const resumeData = { basics: { photo: 'other.jpg' } };
  assert.equal(getPhotoPath(uploadedPhoto, resumeData), 'data:image/jpeg;base64,xyz');
});
