'use client';

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DetailRow } from '../lib/row-details';

const POPOVER_WIDTH = 278;
const VIEWPORT_PAD = 12;

function placePopover(anchor: DOMRect) {
  const above = anchor.bottom + 188 > window.innerHeight - VIEWPORT_PAD;
  let top = above ? anchor.top - 8 : anchor.bottom + 8;
  let left = anchor.left;
  if (left + POPOVER_WIDTH > window.innerWidth - VIEWPORT_PAD) {
    left = Math.max(VIEWPORT_PAD, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PAD);
  }
  return { top, left, above };
}

function TableTextPopover({
  text,
  open,
  position,
  onShow,
  onHide,
}: {
  text: string;
  open: boolean;
  position: { top: number; left: number; above: boolean };
  onShow: () => void;
  onHide: () => void;
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="table-cell-detail-popover table-cell-detail-popover--text"
      role="tooltip"
      style={{
        top: position.top,
        left: position.left,
        width: POPOVER_WIDTH,
        transform: position.above ? 'translateY(-100%)' : undefined,
      }}
      onMouseEnter={onShow}
      onMouseLeave={onHide}
    >
      {text}
    </div>,
    document.body,
  );
}

export function TableClampedText({
  text,
  emptyLabel = '—',
  className = '',
}: {
  text?: string | null;
  emptyLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, above: false });
  const value = text?.trim() ?? '';

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !value) {
      setTruncated(false);
      return;
    }
    setTruncated(el.scrollWidth > el.clientWidth);
  }, [value]);

  const show = useCallback(() => {
    if (!truncated) return;
    const anchor = anchorRef.current ?? ref.current;
    if (!anchor) return;
    setPosition(placePopover(anchor.getBoundingClientRect()));
    setOpen(true);
  }, [truncated]);

  const hide = useCallback(() => setOpen(false), []);

  if (!value) {
    return <span className={`table-clamped-text table-clamped-text--empty ${className}`.trim()}>{emptyLabel}</span>;
  }

  const label = (
    <span ref={ref} className={`table-clamped-text ${className}`.trim()}>
      {value}
    </span>
  );

  if (!truncated) return label;

  return (
    <>
      <span
        ref={anchorRef}
        className="table-cell-detail table-cell-detail--clamp"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
      >
        {label}
      </span>
      <TableTextPopover
        text={value}
        open={open}
        position={position}
        onShow={show}
        onHide={hide}
      />
    </>
  );
}

export function TableCellDetail({
  title,
  rows,
  children,
  className = '',
}: {
  title: string;
  rows: DetailRow[];
  children: ReactNode;
  className?: string;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, above: false });

  const show = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    setPosition(placePopover(anchor.getBoundingClientRect()));
    setOpen(true);
  }, []);

  const hide = useCallback(() => setOpen(false), []);

  if (!rows.length) {
    return <span className={className}>{children}</span>;
  }

  return (
    <>
      <span
        ref={anchorRef}
        className={`table-cell-detail ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        aria-describedby={open ? 'table-cell-detail-popover' : undefined}
      >
        {children}
      </span>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          id="table-cell-detail-popover"
          className="table-cell-detail-popover"
          role="tooltip"
          style={{
            top: position.top,
            left: position.left,
            width: POPOVER_WIDTH,
            transform: position.above ? 'translateY(-100%)' : undefined,
          }}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <strong>{title}</strong>
          {rows.map((row) => (
            <span key={row.label}>
              <b>{row.label}</b>
              <em>{row.value}</em>
            </span>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
