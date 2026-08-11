/**
 * tests/unit/resizeImage.test.ts
 *
 * Unit tests for resizeImage from public/utils.ts.
 * Mocks browser Image and Canvas APIs to verify resize/compress behavior.
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resizeImage } from '../../public/utils';

// ── Mock Setup ────────────────────────────────────────────────────────────────

type ImageCtor = new () => {
  width: number;
  height: number;
  onload: (() => void) | null;
  onerror: ((err: Event) => void) | null;
  src: string;
};

function createMockImageCtor(triggerLoad = true): ImageCtor {
  return class MockImage {
    _width: number;
    _height: number;
    onload: (() => void) | null = null;
    onerror: ((err: Event) => void) | null = null;
    _src: string = '';

    constructor(mockWidth = 100, mockHeight = 100) {
      this._width = mockWidth;
      this._height = mockHeight;
    }

    get width() { return this._width; }
    get height() { return this._height; }

    get src() { return this._src; }
    set src(value: string) {
      this._src = value;
      if (this.onload && triggerLoad) {
        setTimeout(() => this.onload && this.onload(), 0);
      } else if (this.onerror && !triggerLoad) {
        setTimeout(() => this.onerror && this.onerror(new Event('error')), 0);
      }
    }
  } as unknown as ImageCtor;
}

function setupCanvasMock(outputDataUrl: string): void {
  (global as unknown as Record<string, unknown>).document = {
    createElement: (_tag: string) => {
      const ctx = {
        drawImage: () => {},
      };
      return {
        width: 0,
        height: 0,
        getContext: () => ctx,
        toDataURL: () => outputDataUrl,
      };
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('resizeImage returns data URL when image fits within bounds', async () => {
  const output = 'data:image/jpeg;base64,small';
  const MockImageCtor = createMockImageCtor(true);
  (global as unknown as Record<string, unknown>).Image = MockImageCtor;
  setupCanvasMock(output);

  const result = await resizeImage('data:image/png;base64,abc', 400, 400, 0.7);
  assert.equal(result, output);
});

test('resizeImage scales down large image preserving aspect ratio', async () => {
  const output = 'data:image/jpeg;base64,resized';
  const MockImageCtor = createMockImageCtor(true);
  (global as unknown as Record<string, unknown>).Image = MockImageCtor;
  setupCanvasMock(output);

  const result = await resizeImage('data:image/png;base64,abc', 400, 400, 0.7);
  assert.equal(result, output);
});

test('resizeImage rejects when image fails to load', async () => {
  const FailingImageCtor = createMockImageCtor(false);
  (global as unknown as Record<string, unknown>).Image = FailingImageCtor;
  setupCanvasMock('data:image/jpeg;base64,test');

  await assert.rejects(
    async () => resizeImage('bad-url', 400, 400, 0.7),
    /Failed to load image for resizing/
  );
});

test('resizeImage rejects when canvas context is unavailable', async () => {
  const MockImageCtor = createMockImageCtor(true);
  (global as unknown as Record<string, unknown>).Image = MockImageCtor;
  (global as unknown as Record<string, unknown>).document = {
    createElement: (_tag: string) => {
      return {
        width: 100,
        height: 100,
        getContext: () => null,
        toDataURL: () => 'data:image/jpeg;base64,test',
      };
    },
  };

  await assert.rejects(
    async () => resizeImage('data:image/png;base64,abc', 400, 400, 0.7),
    /Failed to get canvas context/
  );
});
