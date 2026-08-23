import { useEffect } from 'react';
import './ConfirmDialog.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Non-dismissible confirmation dialog.
 * - Renders as a separate React dialog (not `window.confirm`).
 * - CANNOT be clicked away: clicking the dimmed backdrop does nothing.
 *   It only closes via the explicit Cancel / Confirm buttons (or Escape).
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
      if (e.key === 'Enter' && !busy) onConfirm();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, busy, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="confirm-overlay">
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="confirm-header">{title}</div>
        <div className="confirm-body">{message}</div>
        <div className="confirm-actions">
          <button
            type="button"
            className="confirm-btn cancel"
            onClick={onCancel}
            disabled={busy}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-btn ok${danger ? ' danger' : ''}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
