import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { TextEncoder } from 'node:util';

// Polyfill for JSDOM
global.TextEncoder = TextEncoder;

// Type for requestAnimationFrame callback
type FrameRequestCallback = (time: number) => void;

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
	url: 'http://localhost',
	pretendToBeVisual: true,
	runScripts: 'outside-only',
});

global.window = dom.window as unknown as Window & typeof globalThis;
global.document = dom.window.document;
// global.navigator = dom.window.navigator; // read-only
global.HTMLElement = dom.window.HTMLElement;
global.HTMLDivElement = dom.window.HTMLDivElement;
global.HTMLButtonElement = dom.window.HTMLButtonElement;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.customElements = dom.window.customElements;
global.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id: number) => clearTimeout(id);

// Import after DOM setup
import {
	getVariantStyles,
	showConfirmModal,
	showToast,
	confirmDelete,
	confirmUnsave,
	showApplyModal,
	__resetModalState,
} from '../../public/utils/modal';

beforeEach(() => {
	document.body.innerHTML = '';
	__resetModalState();
});

afterEach(() => {
	document.body.innerHTML = '';
	__resetModalState();
});

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
	const styles = getVariantStyles('unknown' as 'danger' | 'info' | 'warning');
	assert.equal(styles.borderColor, 'rgba(245, 158, 11, 0.5)');
	assert.equal(styles.confirmBg, '#f59e0b');
});

test('showToast - success variant renders with correct colors', () => {
	showToast({ message: 'Success!', type: 'success', duration: 100 });
	const container = document.getElementById('shared-toast-container');
	assert.ok(container);
	const toast = container.querySelector('[data-testid="toast"]') as HTMLElement;
	assert.ok(toast);
	assert.ok(toast.textContent?.includes('Success!'));
	assert.ok(
		toast.style.background.includes('rgba(16, 185, 129') || toast.style.background.includes('rgb(16, 185, 129')
	);
	assert.ok(toast.style.border.includes('rgba(16, 185, 129') || toast.style.border.includes('rgb(16, 185, 129'));
});

test('showToast - error variant renders with correct colors', () => {
	showToast({ message: 'Error!', type: 'error', duration: 100 });
	const container = document.getElementById('shared-toast-container');
	const toast = container?.querySelector('[data-testid="toast"]') as HTMLElement;
	assert.ok(toast);
	assert.ok(toast.textContent?.includes('Error!'));
	assert.ok(toast.style.background.includes('rgba(239, 68, 68') || toast.style.background.includes('rgb(239, 68, 68'));
	assert.ok(toast.style.border.includes('rgba(239, 68, 68') || toast.style.border.includes('rgb(239, 68, 68'));
});

test('showToast - warning variant renders with correct colors', () => {
	showToast({ message: 'Warning!', type: 'warning', duration: 100 });
	const container = document.getElementById('shared-toast-container');
	const toast = container?.querySelector('[data-testid="toast"]') as HTMLElement;
	assert.ok(toast);
	assert.ok(toast.textContent?.includes('Warning!'));
	assert.ok(
		toast.style.background.includes('rgba(245, 158, 11') || toast.style.background.includes('rgb(245, 158, 11')
	);
});

test('showToast - info variant renders with correct colors', () => {
	showToast({ message: 'Info!', type: 'info', duration: 100 });
	const container = document.getElementById('shared-toast-container');
	const toast = container?.querySelector('[data-testid="toast"]') as HTMLElement;
	assert.ok(toast);
	assert.ok(toast.textContent?.includes('Info!'));
	assert.ok(toast.style.background.includes('rgba(37, 99, 235') || toast.style.background.includes('rgb(37, 99, 235'));
});

test('showToast - auto-removes after duration', async () => {
	showToast({ message: 'Auto remove', type: 'info', duration: 50 });
	const container = document.getElementById('shared-toast-container');
	let toast = container?.querySelector('[data-testid="toast"]');
	assert.ok(toast);

	// Wait for duration + animation (50 + 300) + buffer
	await new Promise(r => setTimeout(r, 500));
	toast = container?.querySelector('[data-testid="toast"]');
	assert.equal(toast, null);
});

test('showToast - stacking multiple toasts', () => {
	showToast({ message: 'First', type: 'info', duration: 1000 });
	showToast({ message: 'Second', type: 'success', duration: 1000 });
	showToast({ message: 'Third', type: 'error', duration: 1000 });

	const container = document.getElementById('shared-toast-container');
	const toasts = container?.querySelectorAll('[data-testid="toast"]');
	assert.equal(toasts?.length, 3);
	assert.ok(toasts?.[0].textContent?.includes('First'));
	assert.ok(toasts?.[1].textContent?.includes('Second'));
	assert.ok(toasts?.[2].textContent?.includes('Third'));
});

test('showConfirmModal - renders modal with title and message', () => {
	showConfirmModal({
		title: 'Test Title',
		message: 'Test message',
		onConfirm: () => {},
	});

	const container = document.getElementById('shared-modal-container');
	assert.ok(container);
	assert.equal(container.style.display, 'flex');

	const modal = container.querySelector('[data-testid="shared-modal"]');
	assert.ok(modal);
	assert.ok(modal.querySelector('h2')?.textContent?.includes('Test Title'));
	assert.ok(modal.querySelector('p')?.textContent?.includes('Test message'));
});

test('showConfirmModal - confirm callback fires on confirm button', async () => {
	let confirmed = false;
	showConfirmModal({
		title: 'Test',
		message: 'Test',
		onConfirm: async () => {
			confirmed = true;
		},
	});

	const confirmBtn = document.querySelector('.btn-confirm') as HTMLButtonElement;
	assert.ok(confirmBtn);
	confirmBtn.click();

	await new Promise(r => setTimeout(r, 50));
	assert.equal(confirmed, true);

	const container = document.getElementById('shared-modal-container');
	assert.equal(container?.style.display, 'none');
});

test('showConfirmModal - cancel callback fires on cancel button', () => {
	let cancelled = false;
	showConfirmModal({
		title: 'Test',
		message: 'Test',
		onConfirm: () => {},
		onCancel: () => {
			cancelled = true;
		},
	});

	const cancelBtn = document.querySelector('.btn-cancel') as HTMLButtonElement;
	assert.ok(cancelBtn);
	cancelBtn.click();

	assert.equal(cancelled, true);
	const container = document.getElementById('shared-modal-container');
	// In JSDOM, style.display might be empty string or 'none'
	assert.ok(!container?.style.display || container?.style.display === 'none');
});

test('showConfirmModal - Escape key triggers cancel', () => {
	let cancelled = false;
	showConfirmModal({
		title: 'Test',
		message: 'Test',
		onConfirm: () => {},
		onCancel: () => {
			cancelled = true;
		},
	});

	const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape' });
	document.dispatchEvent(event);

	assert.equal(cancelled, true);
	const container = document.getElementById('shared-modal-container');
	assert.ok(!container?.style.display || container?.style.display === 'none');
});

test('showConfirmModal - Enter key triggers confirm', async () => {
	let confirmed = false;
	showConfirmModal({
		title: 'Test',
		message: 'Test',
		onConfirm: async () => {
			confirmed = true;
		},
	});

	const event = new dom.window.KeyboardEvent('keydown', { key: 'Enter' });
	document.dispatchEvent(event);

	await new Promise(r => setTimeout(r, 50));
	assert.equal(confirmed, true);
	const container = document.getElementById('shared-modal-container');
	assert.ok(!container?.style.display || container?.style.display === 'none');
});

test('showConfirmModal - close button (X) triggers cancel', () => {
	let cancelled = false;
	showConfirmModal({
		title: 'Test',
		message: 'Test',
		onConfirm: () => {},
		onCancel: () => {
			cancelled = true;
		},
	});

	const closeBtn = document.querySelector('.modal-close') as HTMLButtonElement;
	assert.ok(closeBtn);
	closeBtn.click();

	assert.equal(cancelled, true);
	const container = document.getElementById('shared-modal-container');
	assert.ok(!container?.style.display || container?.style.display === 'none');
});

test('showConfirmModal - variant danger renders danger styles', () => {
	showConfirmModal({
		title: 'Danger',
		message: 'Test',
		variant: 'danger',
		onConfirm: () => {},
	});

	const modal = document.querySelector('[data-testid="shared-modal"]') as HTMLElement;
	assert.ok(modal);
	assert.ok(modal.style.borderColor?.includes('rgba(239, 68, 68, 0.5)'));
	const confirmBtn = modal.querySelector('.btn-confirm') as HTMLButtonElement;
	assert.ok(
		confirmBtn.style.background.includes('#ef4444') || confirmBtn.style.background.includes('rgb(239, 68, 68)')
	);
});

test('confirmDelete - builds correct modal options', () => {
	let confirmCalled = false;
	confirmDelete('Test Item', () => {
		confirmCalled = true;
	});

	const modal = document.querySelector('[data-testid="shared-modal"]') as HTMLElement;
	assert.ok(modal);
	assert.ok(modal.querySelector('h2')?.textContent?.includes('Remove Item'));
	assert.ok(modal.querySelector('p')?.textContent?.includes('Test Item'));
	assert.ok(modal.querySelector('.btn-confirm')?.textContent?.includes('Remove'));
	assert.ok(modal.style.borderColor?.includes('rgba(239, 68, 68, 0.5)'));

	const confirmBtn = modal.querySelector('.btn-confirm') as HTMLButtonElement;
	confirmBtn.click();
	assert.equal(confirmCalled, true);
});

test('confirmDelete - accepts custom message and variant', () => {
	confirmDelete('Custom', () => {}, {
		message: 'Custom message',
		variant: 'warning',
	});

	const modal = document.querySelector('[data-testid="shared-modal"]') as HTMLElement;
	assert.ok(modal?.querySelector('p')?.textContent?.includes('Custom message'));
	assert.ok(modal.style.borderColor?.includes('rgba(245, 158, 11, 0.5)'));
});

test('confirmUnsave - builds correct modal options', () => {
	let confirmCalled = false;
	confirmUnsave('Saved Job', () => {
		confirmCalled = true;
	});

	const modal = document.querySelector('[data-testid="shared-modal"]') as HTMLElement;
	assert.ok(modal);
	assert.ok(modal.querySelector('h2')?.textContent?.includes('Unsave Item'));
	assert.ok(modal.querySelector('p')?.textContent?.includes('Saved Job'));
	assert.ok(modal.querySelector('.btn-confirm')?.textContent?.includes('Unsave'));
	assert.ok(modal.style.borderColor?.includes('rgba(245, 158, 11, 0.5)'));

	const confirmBtn = modal.querySelector('.btn-confirm') as HTMLButtonElement;
	confirmBtn.click();
	assert.equal(confirmCalled, true);
});

test('showApplyModal - renders with suggested name', () => {
	showApplyModal({
		item: { title: 'SDET', company: 'Netflix' },
		onConfirm: () => {},
	});

	const modal = document.querySelector('[data-testid="shared-modal"]');
	assert.ok(modal);
	assert.ok(modal.querySelector('h2')?.textContent?.includes('Add to Dashboard'));
	const input = modal.querySelector('.apply-name-input') as HTMLInputElement;
	assert.ok(input);
	assert.equal(input.value, 'Netflix - SDET');
});

test('showApplyModal - builds suggested name from item', () => {
	showApplyModal({
		item: { title: 'Engineer', company: 'Google' },
		onConfirm: () => {},
	});

	const input = document.querySelector('.apply-name-input') as HTMLInputElement;
	assert.equal(input.value, 'Google - Engineer');
});

test('showApplyModal - validates empty input', async () => {
	let confirmCalled = false;
	showApplyModal({
		item: { title: 'Test', company: 'Test' },
		onConfirm: () => {
			confirmCalled = true;
		},
	});

	const input = document.querySelector('.apply-name-input') as HTMLInputElement;
	const confirmBtn = document.querySelector('.btn-confirm') as HTMLButtonElement;

	input.value = '';
	confirmBtn.click();

	await new Promise(r => setTimeout(r, 50));
	assert.equal(confirmCalled, false);
	assert.ok(input.style.borderColor.includes('rgba(239, 68, 68, 0.8)'));
});

test('showApplyModal - confirms with valid input', async () => {
	let confirmCalled = false;
	let confirmedName = '';
	showApplyModal({
		item: { title: 'Test', company: 'Test' },
		onConfirm: (name: string) => {
			confirmCalled = true;
			confirmedName = name;
		},
	});

	const input = document.querySelector('.apply-name-input') as HTMLInputElement;
	const confirmBtn = document.querySelector('.btn-confirm') as HTMLButtonElement;

	input.value = 'Custom Name';
	confirmBtn.click();

	await new Promise(r => setTimeout(r, 50));
	assert.equal(confirmCalled, true);
	assert.equal(confirmedName, 'Custom Name');
	const container = document.getElementById('shared-modal-container');
	assert.equal(container?.style.display, 'none');
});

test('showApplyModal - Escape key cancels', () => {
	let cancelled = false;
	showApplyModal({
		item: { title: 'Test', company: 'Test' },
		onConfirm: () => {},
		onCancel: () => {
			cancelled = true;
		},
	});

	const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape' });
	document.dispatchEvent(event);

	assert.equal(cancelled, true);
	const container = document.getElementById('shared-modal-container');
	assert.equal(container?.style.display, 'none');
});

test('showApplyModal - Enter key in input confirms', async () => {
	let confirmed = false;
	showApplyModal({
		item: { title: 'Test', company: 'Test' },
		onConfirm: () => {
			confirmed = true;
		},
	});

	const input = document.querySelector('.apply-name-input') as HTMLInputElement;
	input.value = 'Test Name';
	const event = new dom.window.KeyboardEvent('keydown', { key: 'Enter' });
	input.dispatchEvent(event);

	await new Promise(r => setTimeout(r, 50));
	assert.equal(confirmed, true);
});

test('modal - multiple modals can be open (appends to container)', () => {
	showConfirmModal({
		title: 'First',
		message: 'First',
		onConfirm: () => {},
	});

	const container1 = document.getElementById('shared-modal-container');
	const modals1 = container1?.querySelectorAll('[data-testid="shared-modal"]');
	assert.equal(modals1?.length, 1);

	// Second modal appends to same container
	showConfirmModal({
		title: 'Second',
		message: 'Second',
		onConfirm: () => {},
	});

	const modals2 = container1?.querySelectorAll('[data-testid="shared-modal"]');
	assert.equal(modals2?.length, 2);
	assert.ok(modals2?.[1].querySelector('h2')?.textContent?.includes('Second'));
});

test('toast - animation keyframes injected once', () => {
	showToast({ message: 'First', type: 'info', duration: 1000 });
	showToast({ message: 'Second', type: 'info', duration: 1000 });

	const styleEl = document.getElementById('toast-anim-style');
	assert.ok(styleEl);
	assert.ok(styleEl.textContent?.includes('slideIn'));
	assert.ok(styleEl.textContent?.includes('slideOut'));
});
