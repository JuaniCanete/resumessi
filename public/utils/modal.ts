/**
 * Shared Modal Component
 * Reusable confirmation modal with consistent styling across the app
 */

export interface ModalOptions {
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	variant?: 'danger' | 'warning' | 'info';
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void;
}

export interface ToastOptions {
	message: string;
	type?: 'success' | 'error' | 'info' | 'warning';
	duration?: number;
}

let modalContainer: HTMLDivElement | null = null;
let toastContainer: HTMLDivElement | null = null;

// Test-only: reset internal state
export function __resetModalState(): void {
	modalContainer = null;
	toastContainer = null;
}

function ensureModalContainer(): HTMLDivElement {
	if (modalContainer) return modalContainer;
	modalContainer = document.createElement('div');
	modalContainer.id = 'shared-modal-container';
	modalContainer.setAttribute('data-testid', 'shared-modal-container');
	modalContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.75);
    z-index: 10000;
    display: none;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
  `;
	document.body.appendChild(modalContainer);
	return modalContainer;
}

function ensureToastContainer(): HTMLDivElement {
	if (toastContainer) return toastContainer;
	toastContainer = document.createElement('div');
	toastContainer.id = 'shared-toast-container';
	toastContainer.setAttribute('data-testid', 'shared-toast-container');
	toastContainer.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 10001;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
  `;
	document.body.appendChild(toastContainer);
	return toastContainer;
}

export function getVariantStyles(variant: ModalOptions['variant'] = 'warning'): {
	borderColor: string;
	confirmBg: string;
	confirmHover: string;
	icon: string;
} {
	switch (variant) {
		case 'danger':
			return {
				borderColor: 'rgba(239, 68, 68, 0.5)',
				confirmBg: '#ef4444',
				confirmHover: '#dc2626',
				icon: '⚠️',
			};
		case 'info':
			return {
				borderColor: 'rgba(37, 99, 235, 0.5)',
				confirmBg: '#2563eb',
				confirmHover: '#1d4ed8',
				icon: 'ℹ️',
			};
		case 'warning':
		default:
			return {
				borderColor: 'rgba(245, 158, 11, 0.5)',
				confirmBg: '#f59e0b',
				confirmHover: '#d97706',
				icon: '⚠️',
			};
	}
}

export function showConfirmModal(options: ModalOptions): void {
	const container = ensureModalContainer();
	const {
		title,
		message,
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		variant = 'warning',
		onConfirm,
		onCancel,
	} = options;
	const styles = getVariantStyles(variant);

	const modal = document.createElement('div');
	modal.className = 'shared-modal';
	modal.setAttribute('data-testid', 'shared-modal');
	modal.style.cssText = `
    background: var(--secondary, #0a0a0a);
    padding: 28px;
    border-radius: 14px;
    max-width: 480px;
    width: 92%;
    max-height: 88vh;
    overflow-y: auto;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
    position: relative;
    border: 1px solid ${styles.borderColor};
    font-family: 'Comfortaa', sans-serif;
    color: #fff;
  `;

	modal.innerHTML = `
    <button class="modal-close" style="
      position: absolute;
      top: 15px;
      right: 15px;
      background: none;
      border: none;
      color: #fff;
      font-size: 28px;
      cursor: pointer;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      line-height: 1;
      transition: background 0.2s;"
	  onmouseenter="this.style.background='var(--accent, #2563eb)'" onmouseleave="this.style.background='rgba(255,255,255,0.08)'">×</button>
    <h2 style="color: #fff; margin-bottom: 8px; text-align: center; font-family: 'Comfortaa', sans-serif;">${styles.icon} ${title}</h2>
    <p style="color: rgba(255, 255, 255, 0.85); font-size: 14px; text-align: center; margin-bottom: 20px; line-height: 1.5;">${message}</p>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button class="btn-cancel" style="
        flex: 1;
        padding: 11px 14px;
        border: none;
        border-radius: 7px;
        font-weight: 700;
        font-size: 13px;
        font-family: 'Comfortaa', sans-serif;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.12);" 
		onmouseenter="this.style.background='rgba(255,255,255,0.15)'" 
	  	onmouseleave="this.style.background='rgba(255,255,255,0.08)'">${cancelText}</button>
      <button class="btn-confirm" style="
        flex: 1;
        padding: 11px 14px;
        border: none;
        border-radius: 7px;
        font-weight: 700;
        font-size: 13px;
        font-family: 'Comfortaa', sans-serif;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
        background: ${styles.confirmBg};
        color: ${variant === 'warning' ? '#1a1a1a' : '#fff'};" 
		onmouseenter="this.style.background='${styles.confirmHover}'" 
		onmouseleave="this.style.background='${styles.confirmBg}'">${confirmText}</button>
    </div>
  `;

	const closeBtn = modal.querySelector('.modal-close') as HTMLButtonElement;
	const cancelBtn = modal.querySelector('.btn-cancel') as HTMLButtonElement;
	const confirmBtn = modal.querySelector('.btn-confirm') as HTMLButtonElement;

	let activeModalHandler: ((e: KeyboardEvent) => void) | null = null;
	let isHandlingConfirm = false;

	const cleanup = () => {
		if (activeModalHandler) {
			document.removeEventListener('keydown', activeModalHandler);
			activeModalHandler = null;
		}
		isHandlingConfirm = false;
	};

	const close = () => {
		cleanup();
		container.style.display = 'none';
		modal.remove();
	};

	const handleConfirm = async () => {
		if (isHandlingConfirm) return;
		isHandlingConfirm = true;
		closeBtn.disabled = true;
		cancelBtn.disabled = true;
		confirmBtn.disabled = true;
		confirmBtn.textContent = '...';
		try {
			await onConfirm();
		} finally {
			close();
		}
	};

	const handleCancel = () => {
		onCancel?.();
		close();
	};

	closeBtn.addEventListener('click', handleCancel);
	cancelBtn.addEventListener('click', handleCancel);
	confirmBtn.addEventListener('click', handleConfirm);

	activeModalHandler = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			handleCancel();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			handleConfirm();
		}
	};
	document.addEventListener('keydown', activeModalHandler);

	container.appendChild(modal);
	container.style.display = 'flex';
}

export function showToast(options: ToastOptions): void {
	const container = ensureToastContainer();
	const { message, type = 'info', duration = 4000 } = options;

	const toast = document.createElement('div');
	toast.setAttribute('data-testid', 'toast');
	const colors: Record<string, { bg: string; border: string; text: string }> = {
		success: { bg: 'rgba(16, 185, 129, 0.95)', border: 'rgba(16, 185, 129, 1)', text: '#ffffff' },
		error: { bg: 'rgba(239, 68, 68, 0.95)', border: 'rgba(239, 68, 68, 1)', text: '#ffffff' },
		warning: { bg: 'rgba(245, 158, 11, 0.95)', border: 'rgba(245, 158, 11, 1)', text: '#ffffff' },
		info: { bg: 'rgba(37, 99, 235, 0.95)', border: 'rgba(37, 99, 235, 1)', text: '#ffffff' },
	};
	const style = colors[type];

	toast.style.cssText = `
    background: ${style.bg};
    border: 1px solid ${style.border};
    color: ${style.text};
    padding: 12px 18px;
    border-radius: 8px;
    font-family: 'Comfortaa', sans-serif;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    max-width: 360px;
    pointer-events: auto;
    animation: slideIn 0.3s ease-out;
  `;
	toast.textContent = message;

	// Add animation keyframes if not present
	if (!document.getElementById('toast-anim-style')) {
		const styleEl = document.createElement('style');
		styleEl.id = 'toast-anim-style';
		styleEl.textContent = `
      @keyframes slideIn {
        from { opacity: 0; transform: translateX(100px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes slideOut {
        from { opacity: 1; transform: translateX(0); }
        to { opacity: 0; transform: translateX(100px); }
      }
    `;
		document.head.appendChild(styleEl);
	}

	container.appendChild(toast);

	setTimeout(() => {
		toast.style.animation = 'slideOut 0.3s ease-in forwards';
		setTimeout(() => toast.remove(), 300);
	}, duration);
}

// Convenience functions for common patterns
export function confirmDelete(
	itemName: string,
	onConfirm: () => void | Promise<void>,
	options?: { onCancel?: () => void; variant?: 'danger' | 'warning'; message?: string }
): void {
	showConfirmModal({
		title: 'Remove Item',
		message:
			options?.message ||
			`This ${itemName} will be removed and will no longer be shown until a new scraping is done. Do you want to continue?`,
		confirmText: 'Remove',
		cancelText: 'Cancel',
		variant: options?.variant || 'danger',
		onConfirm,
		onCancel: options?.onCancel,
	});
}

export function confirmUnsave(
	itemName: string,
	onConfirm: () => void | Promise<void>,
	options?: { onCancel?: () => void }
): void {
	showConfirmModal({
		title: 'Unsave Item',
		message: `This ${itemName} will be removed from saved jobs. Do you want to continue?`,
		confirmText: 'Unsave',
		cancelText: 'Cancel',
		variant: 'warning',
		onConfirm,
		onCancel: options?.onCancel,
	});
}

export interface ApplyModalOptions {
	item: { title?: string; company?: string };
	onConfirm: (name: string) => void | Promise<void>;
	onCancel?: () => void;
}

export function showApplyModal(options: ApplyModalOptions): void {
	const container = ensureModalContainer();
	const { item, onConfirm, onCancel } = options;
	const suggestedName = [item.company, item.title].filter(Boolean).join(' - ') || 'Untitled Job';

	const modal = document.createElement('div');
	modal.className = 'shared-modal';
	modal.setAttribute('data-testid', 'shared-modal');
	modal.style.cssText = `
    background: var(--secondary, #0a0a0a);
    padding: 28px;
    border-radius: 14px;
    max-width: 480px;
    width: 92%;
    max-height: 88vh;
    overflow-y: auto;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
    position: relative;
    border: 1px solid rgba(37, 99, 235, 0.5);
    font-family: 'Comfortaa', sans-serif;
    color: #fff;
  `;

	modal.innerHTML = `
    <button class="modal-close" style="
      position: absolute;
      top: 15px;
      right: 15px;
      background: none;
      border: none;
      color: #fff;
      font-size: 28px;
      cursor: pointer;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      line-height: 1;
      transition: background 0.2s;" 
	  onmouseenter="this.style.background='var(--accent, #2563eb)'" onmouseleave="this.style.background='rgba(255,255,255,0.08)'">×</button>
    <h2 style="color: #fff; margin-bottom: 8px; text-align: center; font-family: 'Comfortaa', sans-serif;">📌 Add to Dashboard</h2>
    <p style="
	  color: rgba(255, 255, 255, 0.85); 
	  font-size: 14px; text-align: center; 
	  margin-bottom: 4px; line-height: 1.5;">Name card for dashboard. eg: Netflix - AI Engineer</p>
    <input type="text" class="apply-name-input" value="${suggestedName.replace(/"/g, '&quot;')}" style="
      width: 100%;
      padding: 11px 14px;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 7px;
      color: #fff;
      font-family: 'Comfortaa', sans-serif;
      font-size: 13px;
      outline: none;
      margin-bottom: 18px;
      box-sizing: border-box;
    " />
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button class="btn-cancel" style="
        flex: 1;
        padding: 11px 14px;
        border: none;
        border-radius: 7px;
        font-weight: 700;
        font-size: 13px;
        font-family: 'Comfortaa', sans-serif;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.12);
      " onmouseenter="this.style.background='rgba(255,255,255,0.15)'" onmouseleave="this.style.background='rgba(255,255,255,0.08)'">Cancel</button>
      <button class="btn-confirm" style="
        flex: 1;
        padding: 11px 14px;
        border: none;
        border-radius: 7px;
        font-weight: 700;
        font-size: 13px;
        font-family: 'Comfortaa', sans-serif;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
        background: #2563eb;
        color: #fff;
      " onmouseenter="this.style.background='#1d4ed8'" onmouseleave="this.style.background='#2563eb'">Confirm</button>
    </div>
  `;

	const closeBtn = modal.querySelector('.modal-close') as HTMLButtonElement;
	const cancelBtn = modal.querySelector('.btn-cancel') as HTMLButtonElement;
	const confirmBtn = modal.querySelector('.btn-confirm') as HTMLButtonElement;
	const input = modal.querySelector('.apply-name-input') as HTMLInputElement;

	const close = () => {
		document.removeEventListener('keydown', handleKeydown);
		container.style.display = 'none';
		modal.remove();
	};

	let isHandlingConfirm = false;

	const handleConfirm = async () => {
		if (isHandlingConfirm) return;
		isHandlingConfirm = true;
		const name = input.value.trim();
		if (!name) {
			input.style.borderColor = 'rgba(239, 68, 68, 0.8)';
			input.focus();
			isHandlingConfirm = false;
			return;
		}
		closeBtn.disabled = true;
		cancelBtn.disabled = true;
		confirmBtn.disabled = true;
		confirmBtn.textContent = '...';
		try {
			await onConfirm(name);
		} finally {
			close();
		}
	};

	const handleCancel = () => {
		onCancel?.();
		close();
	};

	closeBtn.addEventListener('click', handleCancel);
	cancelBtn.addEventListener('click', handleCancel);
	confirmBtn.addEventListener('click', handleConfirm);

	input.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleConfirm();
		} else if (e.key === 'Escape') {
			handleCancel();
		}
	});

	const handleKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			handleCancel();
			document.removeEventListener('keydown', handleKeydown);
		}
	};
	document.addEventListener('keydown', handleKeydown);

	container.appendChild(modal);
	container.style.display = 'flex';
	setTimeout(() => input.focus(), 50);
}
