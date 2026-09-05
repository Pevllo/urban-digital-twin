import { X } from "lucide-react";

export function Panel({ title, icon, children, className = "", onClose }) {
  return (
    <div className={`panel ${className}`}>
      {title && (
        <div className="panel-header">
          <div className="panel-title">
            {icon}
            <span>{title}</span>
          </div>
          {onClose && (
            <button className="panel-close" onClick={onClose} aria-label="Close panel" type="button">
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </div>
  );
}

export function SectionTitle({ children }) {
  return <h3 className="section-title">{children}</h3>;
}
