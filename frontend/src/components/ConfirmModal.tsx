interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
  reasonLabel?: string;
  reasonValue?: string;
  onReasonChange?: (value: string) => void;
  reasonPlaceholder?: string;
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};

const dialog: React.CSSProperties = {
  background: '#fff', borderRadius: 10, padding: '1.5rem',
  maxWidth: 420, width: '90%',
};

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmColor = '#dc2626',
  onConfirm,
  onCancel,
  reasonLabel,
  reasonValue,
  onReasonChange,
  reasonPlaceholder,
}: Props) {
  const showReason = reasonLabel !== undefined || onReasonChange !== undefined;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div style={overlay} onClick={onCancel}>
      <div
        style={dialog}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-msg"
      >
        <h3 id="confirm-title" style={{ margin: '0 0 0.75rem' }}>{title}</h3>
        <p id="confirm-msg" style={{ margin: '0 0 1.5rem', color: '#555' }}>{message}</p>
        {showReason && (
          <div style={{ margin: '0 0 1.5rem' }}>
            <label
              htmlFor="confirm-reason"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              {reasonLabel ?? 'Reason'}
            </label>
            <textarea
              id="confirm-reason"
              value={reasonValue ?? ''}
              onChange={e => onReasonChange?.(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '0.5rem',
                border: '1px solid #d1d5db', borderRadius: 6, resize: 'vertical',
                fontFamily: 'inherit', fontSize: 'inherit',
              }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: 6, background: confirmColor, color: '#fff', cursor: 'pointer' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
