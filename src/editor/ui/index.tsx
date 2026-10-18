import { useEffect, useId, useRef, useState, type ComponentPropsWithRef, type CSSProperties, type HTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from "react";
import { IconChevronDown, IconX } from "./icons";
import "./ui.css";

export type UiColor = "default" | "blue" | "gray" | "orange" | "teal" | "red";
export type UiVariant = "filled" | "light" | "subtle" | "outline";
export type UiSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends Omit<ComponentPropsWithRef<"button">, "color"> {
	variant?: UiVariant;
	color?: UiColor;
	size?: UiSize;
	loading?: boolean;
	icon?: ReactNode;
}

export function Button({ children, className = "", variant = "filled", color = "default", size = "md", loading, icon, disabled, type = "button", ...props }: ButtonProps) {
	return <button {...props} type={type} className={`ui-button ${className}`} data-variant={variant} data-color={color} data-size={size} disabled={disabled || loading}>
		{loading ? <span className="ui-spinner" aria-hidden="true" /> : icon}{children}
	</button>;
}

interface IconButtonProps extends Omit<ButtonProps, "icon" | "loading"> { "aria-label": string }

export function IconButton({ className = "", variant = "subtle", color = "gray", ...props }: IconButtonProps) {
	return <Button {...props} variant={variant} color={color} className={`ui-icon-button ${className}`} />;
}

interface BadgeProps { children: ReactNode; className?: string; color?: UiColor; size?: "xs" | "sm" | "md" | "lg"; variant?: "filled" | "light" }

export function Badge({ children, className = "", color = "default", size = "md", variant = "light" }: BadgeProps) {
	return <span className={`ui-badge ${className}`} data-color={color} data-size={size} data-variant={variant}>{children}</span>;
}

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> { size?: "sm" | "md"; leftSection?: ReactNode }

export function TextInput({ className = "", leftSection, size = "md", ...props }: TextInputProps) {
	return <div className={`ui-input-wrap ${leftSection ? "has-leading" : ""} ${className}`} data-size={size}>
		{leftSection ? <span className="ui-input-leading">{leftSection}</span> : null}
		<input {...props} className="ui-field ui-input" />
	</div>;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea {...props} className={`ui-field ui-textarea ${className}`} />;
}

interface SelectProps { className?: string; value: string; data: Array<{ value: string; label: string }>; onChange: (value: string) => void; leftSection?: ReactNode; "aria-label"?: string }

export function Select({ className = "", value, data, onChange, leftSection, ...props }: SelectProps) {
	return <div className={`ui-select ${leftSection ? "has-leading" : ""} ${className}`}>
		{leftSection ? <span className="ui-input-leading">{leftSection}</span> : null}
		<select className="ui-field" value={value} aria-label={props["aria-label"]} onChange={(event) => onChange(event.target.value)}>
			{data.map((item) => <option key={item.value || "__all__"} value={item.value}>{item.label}</option>)}
		</select>
		<IconChevronDown className="ui-select-chevron" size={13} />
	</div>;
}

interface SegmentedControlProps<T extends string> { value: T; onChange: (value: T) => void; data: Array<{ value: T; label: ReactNode }> }

export function SegmentedControl<T extends string>({ value, onChange, data }: SegmentedControlProps<T>) {
	const activeIndex = Math.max(0, data.findIndex((item) => item.value === value));
	return <div className="ui-segmented" role="radiogroup" style={{ "--segment-count": data.length, "--segment-index": activeIndex } as CSSProperties}>
		<span className="ui-segmented-indicator" aria-hidden="true" />
		{data.map((item) => <button key={item.value} type="button" role="radio" aria-checked={item.value === value} className={item.value === value ? "is-active" : ""} onClick={() => onChange(item.value)}>{item.label}</button>)}
	</div>;
}

interface NavLinkProps extends Omit<ComponentPropsWithRef<"button">, "children"> { active?: boolean; label: ReactNode }

export function NavLink({ active, label, className = "", ...props }: NavLinkProps) {
	return <button {...props} type="button" className={`ui-nav-link ${active ? "is-active" : ""} ${className}`}>{label}</button>;
}

interface InteractiveSurfaceProps extends HTMLAttributes<HTMLDivElement> { disabled?: boolean; onActivate?: () => void }

export function InteractiveSurface({ children, className = "", disabled = false, onActivate, onClick, onKeyDown, ...props }: InteractiveSurfaceProps) {
	const activateFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
		onKeyDown?.(event);
		if (!event.defaultPrevented && !disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onActivate?.(); }
	};
	return <div {...props} className={`ui-interactive-surface ${className}`} role="button" aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented && !disabled) onActivate?.(); }} onKeyDown={activateFromKeyboard}>{children}</div>;
}

// Floating layers use the native Popover API so they render in the top layer and are never clipped by overflow: hidden panes.
function isPopoverOpen(element: HTMLElement | null) {
	return Boolean(element?.matches(":popover-open"));
}

export function Tooltip({ label, children }: { label: ReactNode; children: ReactElement }) {
	const anchor = useRef<HTMLSpanElement>(null);
	const tip = useRef<HTMLDivElement>(null);
	const timer = useRef<number | null>(null);
	const hide = () => {
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = null;
		if (isPopoverOpen(tip.current)) tip.current!.hidePopover();
	};
	const show = () => {
		hide();
		timer.current = window.setTimeout(() => {
			const target = anchor.current?.firstElementChild;
			const element = tip.current;
			if (!target || !element) return;
			element.showPopover();
			const anchorRect = target.getBoundingClientRect();
			const tipRect = element.getBoundingClientRect();
			const left = Math.min(Math.max(8, anchorRect.left + anchorRect.width / 2 - tipRect.width / 2), window.innerWidth - tipRect.width - 8);
			const above = anchorRect.top - tipRect.height - 6;
			element.style.left = `${left}px`;
			element.style.top = `${above >= 8 ? above : anchorRect.bottom + 6}px`;
		}, 250);
	};
	useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
	return <span ref={anchor} className="ui-tooltip-anchor" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onPointerDown={hide}>
		{children}
		<div ref={tip} popover="manual" role="tooltip" className="ui-tooltip">{label}</div>
	</span>;
}

interface MenuItem { label: ReactNode; onClick: () => void; id?: string }
interface MenuButtonProps { label: ReactNode; items: MenuItem[]; align?: "start" | "end"; active?: boolean; className?: string; size?: UiSize; variant?: UiVariant; color?: UiColor }

export function MenuButton({ label, items, align = "start", active, className = "", size = "sm", variant = "subtle", color }: MenuButtonProps) {
	const menuId = useId();
	const trigger = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const element = menu.current;
		if (!element) return;
		const position = (event: Event) => {
			if ((event as ToggleEvent).newState !== "open" || !trigger.current) return;
			const rect = trigger.current.getBoundingClientRect();
			element.style.top = `${rect.bottom + 4}px`;
			element.style.left = align === "end" ? "auto" : `${rect.left}px`;
			element.style.right = align === "end" ? `${window.innerWidth - rect.right}px` : "auto";
		};
		const sync = (event: Event) => setOpen((event as ToggleEvent).newState === "open");
		element.addEventListener("beforetoggle", position);
		element.addEventListener("toggle", sync);
		return () => { element.removeEventListener("beforetoggle", position); element.removeEventListener("toggle", sync); };
	}, [align]);

	return <>
		<Button ref={trigger} popoverTarget={menuId} aria-haspopup="menu" aria-expanded={open} variant={variant} size={size} color={color} className={`ui-menu-trigger ${active ? "is-active" : ""} ${className}`}>
			{label}<IconChevronDown size={13} />
		</Button>
		<div ref={menu} id={menuId} popover="auto" role="menu" className="ui-menu">
			{items.map((item, index) => <button key={item.id ?? String(index)} type="button" role="menuitem" className="ui-menu-item" onClick={() => { menu.current?.hidePopover(); item.onClick(); }}>{item.label}</button>)}
		</div>
	</>;
}

interface ModalProps { opened: boolean; onClose: () => void; title: ReactNode; children: ReactNode; size?: "sm" | "md" | "lg" | "xl" }

export function Modal({ opened, onClose, title, children, size = "md" }: ModalProps) {
	const dialog = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		if (opened && !element.open) {
			element.showModal();
			element.querySelector<HTMLElement>("[data-autofocus]")?.focus();
		} else if (!opened && element.open) {
			element.close();
		}
	}, [opened]);
	return <dialog ref={dialog} className="ui-modal" data-size={size} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
		<div className="ui-modal-panel">
			<header className="ui-modal-header"><h2>{title}</h2><IconButton aria-label="关闭" size="sm" onClick={onClose}><IconX /></IconButton></header>
			<div className="ui-modal-body">{opened ? children : null}</div>
		</div>
	</dialog>;
}
