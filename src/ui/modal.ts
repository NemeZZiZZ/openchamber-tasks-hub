// Modal: sticky header with a visible close button, Esc, backdrop click,
// body that scrolls inside the dialog (never off-screen in a small iframe),
// focus restored to the opener on close.
import { closeIcon, el, iconButton, Scope } from './dom.ts';

export type Modal = {
  overlay: HTMLElement;
  head: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  scope: Scope;
  close: () => void;
};

const open = new Set<Modal>();

export const closeAllModals = (): void => {
  for (const modal of [...open]) modal.close();
};

export const openModal = (opts: { title: string | Node; onClose?: () => void }): Modal => {
  const opener = document.activeElement as HTMLElement | null;
  const overlay = el('div', 'tk-overlay');
  const dialog = el('div', 'tk-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const head = el('div', 'tk-dialog-head');
  const title = el('h2', 'tk-dialog-title');
  if (typeof opts.title === 'string') title.textContent = opts.title;
  else title.append(opts.title);
  const body = el('div', 'tk-dialog-body');
  const foot = el('div', 'tk-dialog-foot');
  const scope = new Scope();
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    scope.reset();
    overlay.remove();
    open.delete(modal);
    opener?.focus?.();
    opts.onClose?.();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || [...open].pop() !== modal) return;
    event.stopPropagation();
    close();
  };
  const closeButton = iconButton('Close', closeIcon(), () => close());
  head.append(title, closeButton);
  dialog.append(head, body, foot);
  overlay.append(dialog);
  // Press on the dim area only (not a drag that ends there).
  let pressedBackdrop = false;
  overlay.addEventListener('mousedown', (event) => { pressedBackdrop = event.target === overlay; });
  overlay.addEventListener('click', (event) => { if (pressedBackdrop && event.target === overlay) close(); });

  const modal: Modal = { overlay, head, body, foot, scope, close };
  open.add(modal);
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  closeButton.focus();
  return modal;
};
