import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { AnimatedNumber } from './AnimatedNumber';
import { BikeLogo } from './BikeLogo';
import { Icon, type IconName } from './Icon';

export function Skeleton({
  height = 16,
  width = '100%',
  radius = 8,
}: {
  height?: number;
  width?: string | number;
  radius?: number;
}) {
  return (
    <span className="skeleton" style={{ height, width, borderRadius: radius }} aria-hidden="true" />
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="stat-grid" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div className="card stat" key={i}>
          <Skeleton width="60%" height={12} />
          <Skeleton width="80%" height={28} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
  icon = 'bike',
}: {
  title: string;
  text?: string;
  action?: ReactNode;
  icon?: 'bike' | 'fuel' | 'chart' | 'calendar' | 'history';
}) {
  return (
    <div className="empty card">
      <div className={`empty-icon${icon === 'bike' ? ' empty-bike' : ''}`}>
        {icon === 'bike' ? <BikeLogo size={72} /> : <Icon name={icon} size={30} />}
      </div>
      <h2>{title}</h2>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  amount,
  format,
  hint,
  tone,
  icon,
}: {
  label: string;
  value?: string;
  /** When given with format, the number counts up. */
  amount?: number | null;
  format?: (n: number) => string;
  hint?: string;
  tone?: 'good' | 'bad';
  icon?: IconName;
}) {
  return (
    <div className="card stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && (
          <span className="stat-icon">
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <div className="stat-value">
        {amount != null && format ? (
          <AnimatedNumber value={amount} format={format} />
        ) : (
          (value ?? '–')
        )}
      </div>
      {hint && <div className={`stat-hint${tone ? ` tone-${tone}` : ''}`}>{hint}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Accessible modal built on the native <dialog> element. */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal-body">
          <div className="modal-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="toggle" htmlFor={id}>
      <span>
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-desc">{description}</span>}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  );
}
