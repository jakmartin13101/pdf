import { useEffect, useState, type InputHTMLAttributes } from 'react';

/** Text input that keeps local state and commits on blur / Enter (one undo step per edit). */
export function CommitInput({
  value,
  onCommit,
  multiline,
  ...rest
}: { value: string; onCommit: (v: string) => void; multiline?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v !== value) onCommit(v);
  };
  if (multiline) {
    return (
      <textarea
        value={v}
        rows={3}
        placeholder={rest.placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.target as HTMLTextAreaElement).blur();
          if (e.key === 'Escape') {
            setV(value);
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        style={{ resize: 'vertical' }}
      />
    );
  }
  return (
    <input
      {...rest}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setV(value);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

/** Range slider that commits once on release. */
export function CommitRange({ value, min, max, step, onCommit, format }: { value: number; min: number; max: number; step: number; onCommit: (v: number) => void; format?: (v: number) => string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onCommit(v);
  return (
    <div className="field-row">
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => setV(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <span className="narrow" style={{ width: 40, textAlign: 'right', color: 'var(--text-dim)' }}>
        {format ? format(v) : v}
      </span>
    </div>
  );
}

export const PALETTE = [
  '#e8112d', '#ff6b00', '#ffb000', '#ffe600', '#2fbf4a', '#0b7a75', '#00a2ff', '#1f6feb', '#3a3fd9', '#7a3cc9',
  '#c2187c', '#8b4513', '#000000', '#555555', '#9e9e9e', '#ffffff',
];

export function ColorField({ value, onChange, allowNone }: { value: string | null; onChange: (v: string | null) => void; allowNone?: boolean }) {
  return (
    <div className="field-row" style={{ flexWrap: 'wrap' }}>
      <div className="swatches">
        {allowNone && (
          <div
            className={`swatch${value == null ? ' on' : ''}`}
            title="None"
            onClick={() => onChange(null)}
            style={{ background: 'linear-gradient(135deg, transparent 45%, #e33 45%, #e33 55%, transparent 55%), #fff' }}
          />
        )}
        {PALETTE.map((c) => (
          <div key={c} className={`swatch${value?.toLowerCase() === c ? ' on' : ''}`} style={{ background: c }} title={c} onClick={() => onChange(c)} />
        ))}
      </div>
      <input type="color" className="narrow" value={value ?? '#ffffff'} onChange={(e) => onChange(e.target.value)} title="Custom color" />
    </div>
  );
}
