import assert from 'node:assert/strict';
import { findChromePath } from '../../src/scraper/browser';
import fs from 'fs';
import { test, mock } from 'node:test';

// Save original values so tests can restore them
const originalPlatform = process.platform;
const originalEnv = { ...process.env };

function restoreEnv(): void {
	process.env = { ...originalEnv };
}

test('findChromePath returns customPath when it exists', () => {
	mock.method(fs, 'existsSync', (p: string) => p === '/custom/chrome');
	try {
		assert.equal(findChromePath('/custom/chrome'), '/custom/chrome');
	} finally {
		mock.restoreAll();
	}
});

test('findChromePath ignores customPath when it does not exist', () => {
	mock.method(fs, 'existsSync', () => false);
	try {
		assert.equal(findChromePath('/nonexistent/chrome'), undefined);
	} finally {
		mock.restoreAll();
	}
});

test('findChromePath returns CHROME_PATH env var when it exists', () => {
	process.env.CHROME_PATH = '/env/chrome';
	mock.method(fs, 'existsSync', (p: string) => p === '/env/chrome');
	try {
		assert.equal(findChromePath(), '/env/chrome');
	} finally {
		mock.restoreAll();
		restoreEnv();
	}
});

test('findChromePath prefers customPath over CHROME_PATH env var', () => {
	process.env.CHROME_PATH = '/env/chrome';
	mock.method(fs, 'existsSync', (p: string) => p === '/custom/chrome' || p === '/env/chrome');
	try {
		assert.equal(findChromePath('/custom/chrome'), '/custom/chrome');
	} finally {
		mock.restoreAll();
		restoreEnv();
	}
});

test('findChromePath returns first existing platform candidate on win32', () => {
	// Simulate Windows platform
	Object.defineProperty(process, 'platform', { value: 'win32' });
	process.env.PROGRAMFILES = 'C:\\Program Files';
	process.env['PROGRAMFILES(X86)'] = 'C:\\Program Files (x86)';
	process.env.LOCALAPPDATA = 'C:\\Users\\Test\\AppData\\Local';

	const winCandidates = [
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Users\\Test\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
	];

	// Only the second candidate exists
	mock.method(fs, 'existsSync', (p: string) => p === winCandidates[1]);
	try {
		assert.equal(findChromePath(), winCandidates[1]);
	} finally {
		mock.restoreAll();
		restoreEnv();
		Object.defineProperty(process, 'platform', { value: originalPlatform });
	}
});

test('findChromePath returns first existing platform candidate on darwin', () => {
	Object.defineProperty(process, 'platform', { value: 'darwin' });

	const macCandidates = [
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/Applications/Chromium.app/Contents/MacOS/Chromium',
		'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
	];

	// Only the third candidate exists
	mock.method(fs, 'existsSync', (p: string) => p === macCandidates[2]);
	try {
		assert.equal(findChromePath(), macCandidates[2]);
	} finally {
		mock.restoreAll();
		Object.defineProperty(process, 'platform', { value: originalPlatform });
	}
});

test('findChromePath returns first existing platform candidate on linux', () => {
	Object.defineProperty(process, 'platform', { value: 'linux' });

	const linuxCandidates = [
		'/usr/bin/google-chrome',
		'/usr/bin/chromium-browser',
		'/usr/bin/chromium',
		'/snap/bin/chromium',
	];

	// Only the first candidate exists
	mock.method(fs, 'existsSync', (p: string) => p === linuxCandidates[0]);
	try {
		assert.equal(findChromePath(), linuxCandidates[0]);
	} finally {
		mock.restoreAll();
		Object.defineProperty(process, 'platform', { value: originalPlatform });
	}
});

test('findChromePath returns undefined when no candidate exists', () => {
	Object.defineProperty(process, 'platform', { value: 'linux' });
	mock.method(fs, 'existsSync', () => false);
	try {
		assert.equal(findChromePath(), undefined);
	} finally {
		mock.restoreAll();
		Object.defineProperty(process, 'platform', { value: originalPlatform });
	}
});
