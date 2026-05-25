import { useEffect, type ReactNode } from "react";
import { Icon, Btn } from "./index";

/** Centered modal dialog with overlay + escape-to-close. */
export function Modal({
  title, sub, onClose, children, footer, width = 480,
}: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
            {sub && <div className="text-sm text-subtle mt-1">{sub}</div>}
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Sluiten"><Icon name="x" size={14} /></button>
        </div>
        <div className="flex-col gap-3">{children}</div>
        {footer && <div className="flex justify-end gap-2 mt-4" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>{footer}</div>}
      </div>
    </div>
  );
}

/** Labeled form field wrapper. */
export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

/** Standard save/cancel footer. */
export function ModalFooter({ onCancel, onSave, saving, saveLabel = "Opslaan", disabled }: {
  onCancel: () => void; onSave: () => void; saving?: boolean; saveLabel?: string; disabled?: boolean;
}) {
  return (
    <>
      <Btn kind="ghost" onClick={onCancel}>Annuleren</Btn>
      <Btn kind="primary" icon="check" disabled={disabled || saving} onClick={onSave}>{saving ? "Opslaan…" : saveLabel}</Btn>
    </>
  );
}
