import { useEffect, useState, type ReactNode } from 'react';
import { centsToInput, parseMoney, type Cents } from '../../core';
import { useI18n } from '../../i18n';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="btn ghost small" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

/** Text input that edits integer cents. `onChange(null)` while the text is invalid/empty. */
export function MoneyInput({
  value,
  onChange,
  big,
  autoFocus,
  placeholder = '0.00',
  allowNegative,
  ariaLabel,
}: {
  value: Cents | null;
  onChange: (c: Cents | null) => void;
  big?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  allowNegative?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value == null ? '' : centsToInput(value));
  useEffect(() => {
    // Sync external changes that do not match what's typed.
    if (value !== parseMoney(text)) setText(value == null ? '' : centsToInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className={big ? 'big-input num' : 'num'}
      inputMode="decimal"
      autoFocus={autoFocus}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const c = parseMoney(e.target.value);
        onChange(c != null && (allowNegative || c >= 0) ? c : null);
      }}
    />
  );
}

export function NumberInput({ value, onChange, step = 'any', min, max }: { value: number; onChange: (n: number) => void; step?: string; min?: number; max?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      className="num"
      step={step}
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export function Seg<T extends string>({ value, options, onChange, full }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; full?: boolean }) {
  return (
    <div className={`seg${full ? ' full' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** "?" button that opens a "How is this calculated?" sheet. */
export function HowButton({ title, formula, lines }: { title: string; formula: string; lines?: [string, string][] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label={`${t('how.title')}: ${title}`}>
        ?
      </button>
      {open && (
        <Sheet title={t('how.title')} onClose={() => setOpen(false)}>
          <p className="muted small" style={{ marginTop: 0 }}>
            {title}
          </p>
          <pre className="formula">{formula}</pre>
          {lines && (
            <table className="recon">
              <tbody>
                {lines.map(([k, v], i) => (
                  <tr key={i} className={i === lines.length - 1 ? 'total' : ''}>
                    <td>{k}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sheet>
      )}
    </>
  );
}

/** Two-step confirmation for destructive actions. */
export function TwoStepConfirm({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  return (
    <Sheet title={title} onClose={onClose}>
      <p>{description}</p>
      <p className="muted small">{t('confirm.snapshotNote')}</p>
      {step === 1 ? (
        <div className="btn-row">
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn danger" onClick={() => setStep(2)}>
            {t('common.continue')}
          </button>
        </div>
      ) : (
        <>
          <p>
            <strong>{t('confirm.areYouSure')}</strong>
          </p>
          <div className="btn-row">
            <button className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              className="btn danger"
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

