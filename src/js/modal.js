// Opens <dialog> elements modally: the browser traps focus and makes the page inert.
// This helper stops smooth scrolling while open and returns focus on close.
let open = [];
let motionRef = null;
export const setModalMotion = (m) => { motionRef = m; };

export function openModal(dialog, { trigger, onClose } = {}) {
  if (dialog.open) return;
  const returnTo = trigger || document.activeElement;
  dialog.showModal();
  open.push(dialog);
  document.documentElement.classList.add('is-modal');
  motionRef?.stop();
  const handle = () => {
    dialog.removeEventListener('close', handle);
    open = open.filter((d) => d !== dialog);
    if (!open.length) {
      document.documentElement.classList.remove('is-modal');
      motionRef?.start();
    }
    onClose?.();
    if (returnTo && document.contains(returnTo) && typeof returnTo.focus === 'function') {
      returnTo.focus({ preventScroll: true });
    }
  };
  dialog.addEventListener('close', handle);
}
