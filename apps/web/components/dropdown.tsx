'use client';

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
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

export type DropdownProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  children: ReactNode;
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
  'aria-label': ariaLabel,
}: DropdownProps) {
  const options = parseOptions(children);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
  }

  function selectOption(option: DropdownOption) {
    if (option.disabled) return;
    emitChange(option.value);
    close();
    triggerRef.current?.focus();
  }

  function openMenu(startIndex?: number) {
    if (disabled || !options.length) return;
    const initial = startIndex ?? (selectedIndex >= 0 ? selectedIndex : nextEnabledIndex(options, -1, 1));
    setHighlighted(initial >= 0 ? initial : 0);
    setOpen(true);
  }

  function updateMenuPosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const maxMenuHeight = 240;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      minWidth: rect.width,
      maxHeight: Math.min(maxMenuHeight, Math.max(available, 120)),
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      zIndex: 'var(--z-dropdown)',
    });
  }

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close();
    };
    const onViewportChange = () => updateMenuPosition();
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || highlighted < 0 || !listRef.current) return;
    const item = listRef.current.children.item(highlighted) as HTMLElement | null;
    item?.scrollIntoView({ block: 'nearest' });
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

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="ui-dropdown-menu"
          style={menuStyle}
          aria-label={ariaLabel}
        >
          {options.map((option, index) => {
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
          })}
        </ul>,
        document.body,
      )
    : null;

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
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="ui-dropdown-value">{displayLabel}</span>
        <span className="ui-dropdown-chevron" aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}
