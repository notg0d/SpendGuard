import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { X, Info, Layers, ArrowUpRight } from 'lucide-react';

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-lg ${inverse ? 'ss-sidebar-muted' : 'text-primary'}`}>
      <span className="ss-brand-mark"><ArrowUpRight size={24} strokeWidth={2.5} aria-hidden="true" /></span>
      <span className="text-xl font-semibold tracking-tight">subsense<span className="text-brand-primary">.</span></span>
    </span>
  );
}

export const fieldClass =
  'subsense-control min-h-10 w-full rounded-lg border border-primary bg-primary px-lg py-md text-sm text-primary placeholder:text-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50 disabled:cursor-not-allowed';
export function Button({
  children,
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet';
}) {
  return (
    <button
      type="button"
      {...props}
      className={`subsense-button inline-flex min-h-10 shrink-0 justify-center items-center gap-md rounded-full border px-xl py-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${variant === 'primary' ? 'border-transparent bg-brand-solid text-primary-on-brand hover:bg-brand-solid-hover' : variant === 'quiet' ? 'border-transparent text-secondary hover:bg-secondary-hover' : 'border-primary bg-primary text-secondary hover:bg-primary-hover'} ${className}`}
    >
      {children}
    </button>
  );
}
const tones = {
  gray: 'border-utility-gray-200 bg-utility-gray-50 text-utility-gray-700',
  brand: 'border-utility-brand-200 bg-utility-brand-50 text-utility-brand-700',
  success:
    'border-utility-success-200 bg-utility-success-50 text-utility-success-700',
  warning:
    'border-utility-warning-200 bg-utility-warning-50 text-utility-warning-700',
  error: 'border-utility-error-200 bg-utility-error-50 text-utility-error-700',
};
export function Badge({
  children,
  tone = 'gray',
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-xs rounded-full border px-md py-xxs text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const hintId = useId();
  const control = hint && isValidElement<{ 'aria-describedby'?: string }>(children)
    && ['input', 'select', 'textarea'].includes(String(children.type))
    ? cloneElement(children, { 'aria-describedby': [children.props['aria-describedby'], hintId].filter(Boolean).join(' ') })
    : children;
  return (
    <div className="flex flex-col gap-sm text-sm font-medium text-secondary">
      <label className="flex flex-col gap-sm"><span>{label}</span>{control}</label>
      {hint && (
        <span id={hintId} className="text-xs font-regular text-tertiary">{hint}</span>
      )}
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`flex items-start gap-lg rounded-xl border p-xl text-sm ${error ? 'border-utility-error-200 bg-utility-error-50 text-utility-error-700' : 'border-utility-brand-200 bg-utility-brand-50 text-utility-brand-700'}`}
    >
      <Info size={18} className="shrink-0" aria-hidden="true" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-secondary bg-primary p-4xl text-center">
      <span className="mx-auto mb-xl flex size-12 items-center justify-center rounded-full bg-secondary text-fg-secondary">
        <Layers size={24} className="shrink-0" aria-hidden="true" />
      </span>
      <h3 className="text-lg font-semibold text-primary">{title}</h3>
      <div className="mt-md text-sm text-tertiary">{children}</div>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const element = ref.current;
    // Isolate the overlay for keyboard and assistive technology, not just Tab.
    const isolated: { element: HTMLElement; inert: boolean }[] = [];
    let branch = element?.parentElement;
    while (branch && branch !== document.body) {
      for (const sibling of branch.parentElement?.children ?? []) {
        if (
          sibling !== branch &&
          sibling instanceof HTMLElement &&
          !['SCRIPT', 'STYLE'].includes(sibling.tagName)
        ) {
          isolated.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
    }
    const focusables = () => [
      ...(element?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
      ) ?? []),
    ];
    (focusables()[0] ?? element)?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      }
      if (e.key === 'Tab') {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        if (!first) {
          e.preventDefault();
          element?.focus();
        } else if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === element)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      document.body.style.overflow = scroll;
      isolated.forEach(({ element, inert }) => {
        element.inert = inert;
      });
      previous?.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-xl">
      <div
        className="absolute inset-0 bg-overlay opacity-70"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-4xl border border-primary bg-primary shadow-2xl"
      >
        <header className="flex items-start justify-between gap-lg border-b border-secondary p-2xl">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-primary">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-xs text-sm text-tertiary">{subtitle}</p>
            )}
          </div>
          <Button variant="quiet" aria-label="Close dialog" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </Button>
        </header>
        <div className="min-h-0 overflow-y-auto p-2xl">{children}</div>
      </div>
    </div>
  );
}

/** Neutral identities, not fabricated vendor logos. */
export function ServiceAvatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-secondary bg-secondary text-sm font-semibold text-brand-primary"
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-lg">
      <div className="min-w-0">
        <h2 className="text-md font-semibold text-primary">{title}</h2>
        {description && (
          <p className="mt-xs text-xs text-tertiary">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
