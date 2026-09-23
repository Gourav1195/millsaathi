import type {
  ButtonHTMLAttributes,
  FormHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`ui-card ${className}`}>{children}</section>;
}

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`ui-button ms-focus-ring ${className}`} {...props} />;
}

export function IconButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`ui-icon-btn ms-focus-ring ${className}`} {...props} />;
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ms-focus-ring ${className}`} {...props} />;
}

export { Dropdown as Select } from './dropdown';

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`ui-input ui-textarea ms-focus-ring ${className}`} {...props} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="ui-field"><span>{label}</span>{children}</label>;
}

export function Panel({
  title,
  children,
  className = '',
  actions,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`ui-panel ${className}`}>
      {(title || actions) && (
        <div className="ui-panel-header">
          {title ? <h2>{title}</h2> : <span />}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function ScreenToolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`screen-toolbar ${className}`}>{children}</div>;
}

export function TableCard({
  title,
  subtitle,
  toolbar,
  actions,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  toolbar?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`dashboard-card data-table-card ${className}`}>
      {(title || actions) && (
        <div className="card-title-row">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      )}
      {toolbar}
      {children}
    </Card>
  );
}

export type TableColumn = { id: string; label: string; className?: string };

export function DataTable({ columns, children }: { columns: TableColumn[]; children: ReactNode }) {
  return (
    <div className="dashboard-table-wrap ms-scroll">
      <table className="dashboard-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} className={column.className}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TableActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`table-actions ${className}`}>{children}</div>;
}

export function FormGrid({
  children,
  className = '',
  ...props
}: FormHTMLAttributes<HTMLFormElement> & { children: ReactNode }) {
  return <form className={`ui-form-grid ${className}`} {...props}>{children}</form>;
}

export function FormActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`form-actions ${className}`}>{children}</div>;
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'gold' | 'live';

export function Badge({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return <span className={`ui-badge ui-badge--${tone} ${className}`}>{children}</span>;
}

export function Alert({
  title,
  children,
  level = 'amber',
  className = '',
}: {
  title: string;
  children?: ReactNode;
  level?: 'red' | 'amber' | 'blue';
  className?: string;
}) {
  return (
    <article className={`alert ${level} ${className}`}>
      <strong>{title}</strong>
      {children ? <span>{children}</span> : null}
    </article>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  date,
  season,
  className = '',
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  date?: string;
  season?: string;
  className?: string;
}) {
  const meta = date || season ? (
    <div className="date-chip">
      {date ? <div className="d">{date}</div> : null}
      {season ? <div className="s">{season}</div> : null}
    </div>
  ) : null;

  return (
    <header className={`app-page-header ${className}`}>
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {(actions || meta) ? (
        <div className="app-page-actions">
          {actions}
          {meta}
        </div>
      ) : null}
    </header>
  );
}

export function Tab({
  selected,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button type="button" role="tab" aria-selected={selected} className={`ui-tab ms-focus-ring${selected ? ' selected' : ''} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function TabRow({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-tab-row ${className}`} role="tablist" {...props}>{children}</div>;
}

export function EmptyState({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`empty-state ${className}`}>{children}</div>;
}

export function TableFilters({
  title,
  compact = false,
  children,
  onClear,
  clearDisabled,
}: {
  title?: string;
  compact?: boolean;
  children: ReactNode;
  onClear?: () => void;
  clearDisabled?: boolean;
}) {
  return (
    <div className={`table-filters${compact ? ' table-filters--compact' : ''}`}>
      {!compact && title ? (
        <div className="filter-title">
          <span aria-hidden="true">⌕</span>
          <div>
            <strong>Filter {title}</strong>
            <small>Search and narrow the results</small>
          </div>
        </div>
      ) : null}
      <div className="filter-fields">
        {children}
        {onClear ? (
          <button type="button" className="clear-filters ms-focus-ring" onClick={onClear} disabled={clearDisabled}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function FilterSearch({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  'aria-label'?: string;
}) {
  return (
    <label className="filter-search">
      <span aria-hidden="true">⌕</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={ariaLabel ?? placeholder} />
    </label>
  );
}

export function RangeField({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}) {
  return (
    <label className="range-field">
      <span>{label}</span>
      <input className="table-filter ms-focus-ring" type="number" min="0" step="0.01" placeholder="Min" value={min} onChange={(e) => onMinChange(e.target.value)} />
      <span>–</span>
      <input className="table-filter ms-focus-ring" type="number" min="0" step="0.01" placeholder="Max" value={max} onChange={(e) => onMaxChange(e.target.value)} />
    </label>
  );
}

export function TablePager({
  total,
  index,
  pageSize,
  onPrevious,
  onNext,
}: {
  total: number;
  index: number;
  pageSize: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (total <= pageSize) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = index * pageSize + 1;
  const end = Math.min(total, (index + 1) * pageSize);
  return (
    <div className="pager">
      <span className="hint">Showing {start}–{end} of {total}</span>
      <div className="pager-actions">
        <Button type="button" className="quiet" onClick={onPrevious} disabled={index === 0}>Previous</Button>
        <span className="hint">Page {index + 1} of {pages}</span>
        <Button type="button" className="quiet" onClick={onNext} disabled={index >= pages - 1}>Next</Button>
      </div>
    </div>
  );
}

/** Wrapper for React Flow, mind-maps, and other pannable canvases. */
export function Canvas({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ms-canvas ${className}`} {...props}>{children}</div>;
}

/** Generic droppable surface — pair with @dnd-kit or native drag events. */
export function DropZone({
  active,
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { active?: boolean }) {
  return (
    <div className={`ms-dropzone${active ? ' ms-dropzone--over' : ''} ${className}`} {...props}>
      {children}
    </div>
  );
}
