import { Trash2, AlertTriangle, Loader2 } from "lucide-react";

export function DeleteConfirmModal({
  isOpen,
  development,
  onConfirm,
  onCancel,
  isDeleting = false,
  error = null,
}) {
  if (!isOpen || !development) return null;

  const devName = development.name || development.development_type;
  const devType = development.development_type;
  const isProposed = development.status === "proposed";

  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className="modal-dialog delete-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        <div className="modal-header">
          <div className="modal-icon-badge danger">
            <AlertTriangle size={18} />
          </div>
          <div className="modal-title-group">
            <h3 id="delete-dialog-title" className="modal-title">
              Delete Development?
            </h3>
            <span className="modal-subtitle">Destructive Action</span>
          </div>
        </div>

        <div className="modal-body">
          <p className="delete-warning-text">
            Are you sure you want to permanently delete this {isProposed ? "proposed" : ""}{" "}
            development from the digital twin?
          </p>

          <div className="delete-target-card">
            <div className="delete-target-name">{devName}</div>
            <div className="delete-target-meta">
              <span className="badge dev-type">{devType}</span>
              {development.floors && (
                <span className="badge">{development.floors} Floors</span>
              )}
              {isProposed && <span className="badge proposed">Proposed Scenario</span>}
            </div>
          </div>

          {error && <div className="modal-error-banner">{error}</div>}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn secondary"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 size={14} className="spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 size={14} />
                Delete Development
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
