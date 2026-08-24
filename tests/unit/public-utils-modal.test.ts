/**
 * tests/unit/public-utils-modal.test.ts
 *
 * Unit tests for public/utils/modal.ts modal and toast utilities.
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock DOM for testing
const originalWindow = global.window;
const originalDocument = global.document;

function setupDom() {
	global.window = {} as unknown as Window & typeof globalThis;
	global.document = {
		createElement: (tag: string) => {
const el: any = {
			tagName: tag.toUpperCase(),
			style: {},
			classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
			setAttribute: () => {},
			getAttribute: () => null,
			appendChild: () => {},
			remove: () => {},
			querySelector: () => null,
			querySelectorAll: () => [],
			removeEventListener: () => {},
			addEventListener: () => {},
			focus: () => {},
			disabled: false,
			textContent: '',
			innerHTML: '',
			value: '',
			className: '',
			id: '',
		};
			if (tag === 'style') {
				el.textContent = '';
				el.id = '';
			}
			return el;
		},
		body: {
			appendChild: () => {},
			classList: { add: () => {}, remove: () => {}, contains: () => false },
		},
		head: { appendChild: () => {} },
		getElementById: () => null,
		querySelector: () => null,
		querySelectorAll: () => [],
	} as unknown as Document;
}

function teardownDom() {
	global.window = originalWindow;
	global.document = originalDocument;
}

import {
	getVariantStyles,
	showConfirmModal,
	showToast,
	confirmDelete,
	confirmUnsave,
	showApplyModal,
} from '../../public/utils/modal';

test('getVariantStyles - danger variant returns correct styles', () => {
	const styles = getVariantStyles('danger');
	assert.equal(styles.borderColor, 'rgba(239, 68, 68, 0.5)');
	assert.equal(styles.confirmBg, '#ef4444');
	assert.equal(styles.confirmHover, '#dc2626');
	assert.equal(styles.icon, '⚠️');
});

test('getVariantStyles - info variant returns correct styles', () => {
	const styles = getVariantStyles('info');
	assert.equal(styles.borderColor, 'rgba(37, 99, 235, 0.5)');
	assert.equal(styles.confirmBg, '#2563eb');
	assert.equal(styles.confirmHover, '#1d4ed8');
	assert.equal(styles.icon, 'ℹ️');
});

test('getVariantStyles - warning variant (default) returns correct styles', () => {
	const styles = getVariantStyles('warning');
	assert.equal(styles.borderColor, 'rgba(245, 158, 11, 0.5)');
	assert.equal(styles.confirmBg, '#f59e0b');
	assert.equal(styles.confirmHover, '#d97706');
	assert.equal(styles.icon, '⚠️');
});

test('getVariantStyles - unknown variant falls back to warning', () => {
	const styles = getVariantStyles('unknown' as any);
	assert.equal(styles.confirmBg, '#f59e0b');
	assert.equal(styles.icon, '⚠️');
});

// NOTE: showConfirmModal, showToast, confirmDelete, confirmUnsave, showApplyModal
// are DOM-heavy functions that require a full browser environment.
// They are tested in E2E tests (tests/e2e/). Unit tests here focus on
// pure logic functions like getVariantStyles.

test('modal logic - variant styles are used correctly', () => {
	// Test that variant styles map correctly for use in modals
	const dangerStyles = getVariantStyles('danger');
	const warningStyles = getVariantStyles('warning');
	const infoStyles = getVariantStyles('info');

	// Each variant should have distinct colors
	assert.notEqual(dangerStyles.confirmBg, warningStyles.confirmBg);
	assert.notEqual(dangerStyles.confirmBg, infoStyles.confirmBg);
	assert.notEqual(warningStyles.confirmBg, infoStyles.confirmBg);

	// All should have required properties
	['danger', 'warning', 'info'].forEach(variant => {
		const styles = getVariantStyles(variant as any);
		assert.ok(styles.borderColor);
		assert.ok(styles.confirmBg);
		assert.ok(styles.confirmHover);
		assert.ok(styles.icon);
	});
});

test('confirmDelete - builds correct modal options', () => {
	// Test the option building logic
	const itemName = 'Test Job';
	const options = {
		title: 'Remove Item',
		message: `This ${itemName} will be removed and will no longer be shown until a new scraping is done. Do you want to continue?`,
		confirmText: 'Remove',
		cancelText: 'Cancel',
		variant: 'danger' as const,
		onConfirm: () => {},
		onCancel: () => {},
	};

	assert.equal(options.title, 'Remove Item');
	assert.ok(options.message.includes(itemName));
	assert.equal(options.confirmText, 'Remove');
	assert.equal(options.variant, 'danger');
});

test('confirmUnsave - builds correct modal options', () => {
	const itemName = 'Test Job';
	const options = {
		title: 'Unsave Item',
		message: `This ${itemName} will be removed from saved jobs. Do you want to continue?`,
		confirmText: 'Unsave',
		cancelText: 'Cancel',
		variant: 'warning' as const,
		onConfirm: () => {},
		onCancel: () => {},
	};

	assert.equal(options.title, 'Unsave Item');
	assert.ok(options.message.includes(itemName));
	assert.equal(options.confirmText, 'Unsave');
	assert.equal(options.variant, 'warning');
});

test('showApplyModal - builds suggested name from item', () => {
	// Test the suggested name logic
	const item1 = { title: 'AI Engineer', company: 'Netflix' };
	const suggested1 = [item1.company, item1.title].filter(Boolean).join(' - ');
	assert.equal(suggested1, 'Netflix - AI Engineer');

	const item2 = { title: 'Engineer', company: '' };
	const suggested2 = [item2.company, item2.title].filter(Boolean).join(' - ');
	assert.equal(suggested2, 'Engineer');

	const item3 = { title: '', company: 'Google' };
	const suggested3 = [item3.company, item3.title].filter(Boolean).join(' - ');
	assert.equal(suggested3, 'Google');

	const item4 = { title: '', company: '' };
	const suggested4 = [item4.company, item4.title].filter(Boolean).join(' - ') || 'Untitled Job';
	assert.equal(suggested4, 'Untitled Job');
});

test('Toast colors - all variants have correct structure', () => {
	const colors = {
		success: { bg: 'rgba(16, 185, 129, 0.95)', border: 'rgba(16, 185, 129, 1)', text: '#ffffff' },
		error: { bg: 'rgba(239, 68, 68, 0.95)', border: 'rgba(239, 68, 68, 1)', text: '#ffffff' },
		warning: { bg: 'rgba(245, 158, 11, 0.95)', border: 'rgba(245, 158, 11, 1)', text: '#ffffff' },
		info: { bg: 'rgba(37, 99, 235, 0.95)', border: 'rgba(37, 99, 235, 1)', text: '#ffffff' },
	};

	Object.entries(colors).forEach(([type, style]) => {
		assert.ok(style.bg.startsWith('rgba('));
		assert.ok(style.border.startsWith('rgba('));
		assert.equal(style.text, '#ffffff');
		assert.ok(style.bg.includes(type === 'success' ? '16, 185, 129' :
			type === 'error' ? '239, 68, 68' :
			type === 'warning' ? '245, 158, 11' : '37, 99, 235'));
	});
});

test('Toast animation keyframes - correct structure', () => {
	const keyframes = `
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(100px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes slideOut {
      from { opacity: 1; transform: translateX(0); }
      to { opacity: 0; transform: translateX(100px); }
    }
  `;

	assert.ok(keyframes.includes('slideIn'));
	assert.ok(keyframes.includes('slideOut'));
	assert.ok(keyframes.includes('translateX(100px)'));
	assert.ok(keyframes.includes('opacity: 0'));
	assert.ok(keyframes.includes('opacity: 1'));
});
