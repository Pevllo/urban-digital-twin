import { AlertTriangle } from "lucide-react";

export function ErrorMessage({ message, retry, compact }) {
  if (!message) return null;
  return (
    <div className={`error-message${compact ? " error-compact" : ""}`} role="alert">
      <AlertTriangle size={14} />
      <span>{message}</span>
      {retry && (
        <button className="error-retry" onClick={retry} type="button">
          Retry
        </button>
      )}
    </div>
  );
}
