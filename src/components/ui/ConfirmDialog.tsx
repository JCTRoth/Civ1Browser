import React, { useEffect, useRef } from 'react';
import { Modal } from 'react-bootstrap';
import '../../styles/confirmDialog.css';

interface ConfirmDialogProps {
  show: boolean;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'success';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible, mobile-friendly confirmation dialog.
 * Replaces native window.confirm() which is inconsistent and
 * untrustworthy on mobile browsers.
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  show,
  title,
  message,
  detail,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  // Focus the confirm button when opened for keyboard users
  useEffect(() => {
    if (show && confirmRef.current) {
      const t = window.setTimeout(() => confirmRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [show]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm();
    }
  };

  const variantClass = variant === 'danger' ? 'touch-btn--danger' : variant === 'success' ? 'touch-btn--success' : 'touch-btn--primary';

  return (
    <Modal
      show={show}
      onHide={onCancel}
      centered
      backdrop="static"
      keyboard={false}
      dialogClassName="confirm-dialog"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onKeyDown={handleKeyDown}
        className="confirm-dialog__inner"
      >
        <Modal.Header className="confirm-dialog__header" closeButton={false}>
          <Modal.Title id="confirm-dialog-title" as="h2" className="confirm-dialog__title">
            {title}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="confirm-dialog__body">
          <p id="confirm-dialog-message" className="confirm-dialog__message">{message}</p>
          {detail && <p className="confirm-dialog__detail">{detail}</p>}
        </Modal.Body>
        <Modal.Footer className="confirm-dialog__footer">
          <button type="button" className="touch-btn touch-btn--ghost confirm-dialog__btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={`touch-btn ${variantClass} confirm-dialog__btn`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </Modal.Footer>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
