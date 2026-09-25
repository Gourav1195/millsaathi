'use client';

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

type DropdownOption = { value: string; label: string; disabled?: boolean };

function parseOptions(children: ReactNode): DropdownOption[] {
  const options: DropdownOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const element = child as ReactElement<{ value?: string; disabled?: boolean; children?: ReactNode }>;
    const props = element.props;
    const labelNode = props.children;
    const label =
      typeof labelNode === 'string' || typeof labelNode === 'number'
        ? String(labelNode)
        : props.value ?? '';
    const value = props.value ?? label;
    options.push({ value, label, disabled: props.disabled });
  });
  return options;
}

function nextEnabledIndex(options: DropdownOption[], start: number, direction: 1 | -1) {
  if (!options.length) return -1;
  let index = start;
  for (let step = 0; step < options.length; step += 1) {
    index = (index + direction + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

function computeMenuStyle(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const viewportPadding = 8;
  const maxMenuHeight = 240;
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
  const available = openUp ? spaceAbove : spaceBelow;
  const menuMinWidth = Math.max(rect.width, 196);
  return {
    position: 'fixed',
    left: rect.left,
    width: menuMinWidth,
    minWidth: menuMinWidth,
    maxHeight: Math.min(maxMenuHeight, Math.max(available, 120)),
    top: openUp ? undefined : rect.bottom + 4,
    bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
    zIndex: 'var(--z-dropdown)',
  };
}

function scrollHighlightedIntoMenu(menu: HTMLUListElement, item: HTMLElement) {
  const itemTop = item.offsetTop;
  const itemBottom = itemTop + item.offsetHeight;
  const viewTop = menu.scrollTop;
  const viewBottom = viewTop + menu.clientHeight;
  if (itemTop < viewTop) menu.scrollTop = itemTop;
  else if (itemBottom > viewBottom) menu.scrollTop = itemBottom - menu.clientHeight;
}

export type DropdownProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  children: ReactNode;
  /** Portal menus follow scroll; inline menus anchor to the trigger (tables). */
  menuPlacement?: 'portal' | 'inline';
  /** When false, a portaled menu stays pinned on open. */
  trackScroll?: boolean;
  menuClassName?: string;
  searchable?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
};

export function Dropdown({
  className = '',
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  id,
  menuPlacement = 'portal',
  trackScroll = true,
  menuClassName = '',
  searchable = false,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches',
  'aria-label': ariaLabel,
}: DropdownProps) {
  const options = parseOptions(children);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const generatedId = useId();
  const listboxId = id ? `${id}-listbox` : `${generatedId}-listbox`;

  const currentValue = value === undefined || value === null ? (defaultValue ?? '') : value;
  const selectedIndex = options.findIndex((option) => option.value === String(currentValue));
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const displayLabel = selected?.label ?? (options[0]?.label ?? 'Select');

  function emitChange(nextValue: string) {
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as ChangeEvent<HTMLSelectElement>);
  }

  function close() {
    setOpen(false);
    setHighlighted(-1);
    onSearchChange?.('');
  }

  function selectOption(option: DropdownOption) {
    if (option.disabled) return;
    emitChange(option.value);
    close();
    triggerRef.current?.focus({ preventScroll: true });
  }

  function openMenu(startIndex?: number) {
    if (disabled || !options.length) return;
    const initial = startIndex ?? (selectedIndex >= 0 ? selectedIndex : nextEnabledIndex(options, -1, 1));
    const trigger = triggerRef.current;
    if (trigger && menuPlacement === 'portal') setMenuStyle(computeMenuStyle(trigger));
    setHighlighted(initial >= 0 ? initial : 0);
    setOpen(true);
  }

  function updateMenuPosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setMenuStyle(computeMenuStyle(trigger));
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !searchable) return;
    searchRef.current?.focus({ preventScroll: true });
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    setHighlighted(options.length ? nextEnabledIndex(options, -1, 1) : -1);
  }, [open, searchValue, options.length]);

  useLayoutEffect(() => {
    if (!open || menuPlacement !== 'portal') return;
    updateMenuPosition();
    const onViewportChange = () => updateMenuPosition();
    window.addEventListener('resize', onViewportChange);
    if (trackScroll) window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      if (trackScroll) window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, menuPlacement, trackScroll]);

  useLayoutEffect(() => {
    if (!open || highlighted < 0 || !listRef.current) return;
    const item = listRef.current.children.item(highlighted) as HTMLElement | null;
    if (item) scrollHighlightedIntoMenu(listRef.current, item);
  }, [open, highlighted]);

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openMenu(nextEnabledIndex(options, highlighted >= 0 ? highlighted : selectedIndex, 1));
        else setHighlighted((current) => nextEnabledIndex(options, current, 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openMenu(nextEnabledIndex(options, highlighted >= 0 ? highlighted : selectedIndex, -1));
        else setHighlighted((current) => nextEnabledIndex(options, current, -1));
        break;
      case 'Home':
        event.preventDefault();
        if (!open) openMenu(nextEnabledIndex(options, -1, 1));
        else setHighlighted(nextEnabledIndex(options, -1, 1));
        break;
      case 'End':
        event.preventDefault();
        if (!open) openMenu(nextEnabledIndex(options, 0, -1));
        else setHighlighted(nextEnabledIndex(options, 0, -1));
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!open) {
          openMenu();
          return;
        }
        if (highlighted >= 0 && options[highlighted]) selectOption(options[highlighted]);
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          close();
        }
        break;
      default:
        break;
    }
  }

  const menuClass = [
    'ui-dropdown-menu',
    menuPlacement === 'inline' ? 'ui-dropdown-menu--inline' : '',
    menuClassName,
  ].filter(Boolean).join(' ');

  const menu = open ? (
    <div
      ref={menuRef}
      className={menuClass}
      style={menuPlacement === 'portal' ? { visibility: menuStyle.position ? 'visible' : 'hidden', ...menuStyle } : undefined}
    >
      {searchable ? (
        <div className="ui-dropdown-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            value={searchValue}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(event) => onSearchChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlighted((current) => nextEnabledIndex(options, current, 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlighted((current) => nextEnabledIndex(options, current, -1));
              } else if (event.key === 'Enter' && highlighted >= 0 && options[highlighted]) {
                event.preventDefault();
                selectOption(options[highlighted]);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                close();
                triggerRef.current?.focus({ preventScroll: true });
              }
            }}
          />
        </div>
      ) : null}
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label={ariaLabel}
      >
        {options.length ? options.map((option, index) => {
          const isSelected = option.value === String(currentValue);
          const isHighlighted = index === highlighted;
          return (
            <li
              key={`${option.value}-${index}`}
              role="option"
              aria-selected={isSelected}
              aria-disabled={option.disabled || undefined}
              className={`ui-dropdown-option${isSelected ? ' selected' : ''}${isHighlighted ? ' highlighted' : ''}${option.disabled ? ' disabled' : ''}`}
              onMouseEnter={() => !option.disabled && setHighlighted(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
            >
              <span className="ui-dropdown-option-label">{option.label}</span>
              {isSelected ? <span className="ui-dropdown-option-check" aria-hidden="true">✓</span> : null}
            </li>
          );
        }) : (
          <li className="ui-dropdown-empty">{emptyMessage}</li>
        )}
      </ul>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`ui-dropdown${open ? ' open' : ''} ${className}`.trim()}>
      {name ? <input type="hidden" name={name} value={String(currentValue)} /> : null}
      {required ? (
        <select
          tabIndex={-1}
          aria-hidden="true"
          className="ui-dropdown-native"
          value={String(currentValue)}
          required
          onChange={() => undefined}
        >
          {children}
        </select>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="ui-dropdown-trigger ui-select ms-focus-ring"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onMouseDown={(event) => {
          if (disabled) return;
          event.preventDefault();
        }}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="ui-dropdown-value">{displayLabel}</span>
        <span className="ui-dropdown-chevron" aria-hidden="true" />
      </button>
      {menuPlacement === 'portal' && menu && typeof document !== 'undefined'
        ? createPortal(menu, document.body)
        : menu}
    </div>
  );
}
