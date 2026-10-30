import { useEffect, useLayoutEffect, useRef, type ComponentPropsWithRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

/*
 * The editor's controls come from sityle (Button, IconButton, Menu, Dialog, Tooltip…).
 * What sityle has no component for lives here, drawn with sityle's own classes and tokens.
 */

interface InlineIconButtonProps extends ComponentPropsWithRef<"button"> { label: string }

/**
 * sityle's quiet icon button for the small actions inside content rows (drag handle, fold toggle, copy).
 * Unlike sityle's IconButton it adds no tooltip wrapper, so the button itself stays the grid / flex item.
 */
export function InlineIconButton({ label, className = "", ...props }: InlineIconButtonProps) {
	return <button type="button" aria-label={label} title={label} {...props} className={`si-iconbtn inline-icon-button ${className}`} />;
}

interface InteractiveSurfaceProps extends HTMLAttributes<HTMLDivElement> { disabled?: boolean; onActivate?: () => void }

/** A clickable card that may hold other content (a <button> can't): Enter / Space activate it. */
export function InteractiveSurface({ children, className = "", disabled = false, onActivate, onClick, onKeyDown, ...props }: InteractiveSurfaceProps) {
	const activateFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
		onKeyDown?.(event);
		if (!event.defaultPrevented && !disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onActivate?.(); }
	};
	return <div {...props} className={`interactive-surface ${className}`} role="button" aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented && !disabled) onActivate?.(); }} onKeyDown={activateFromKeyboard}>{children}</div>;
}

export interface MenuItem { label: ReactNode; onClick: () => void; id?: string; shortcut?: string; disabled?: boolean; danger?: boolean }
/** A menu row: an action, a divider, or a small group heading. */
export type MenuEntry = MenuItem | "separator" | { heading: string };

interface ContextMenuProps { position: { x: number; y: number } | null; items: MenuEntry[]; onClose: () => void }

/**
 * sityle's menu panel opened at the pointer (sityle's Menu always unfolds from a trigger).
 * Dismissed by clicking elsewhere, Escape, scrolling or resizing.
 */
export function ContextMenu({ position, items, onClose }: ContextMenuProps) {
	const menu = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const element = menu.current;
		if (!element || !position) return;
		const rect = element.getBoundingClientRect();
		element.style.left = `${Math.max(4, Math.min(position.x, window.innerWidth - rect.width - 4))}px`;
		element.style.top = `${Math.max(4, Math.min(position.y, window.innerHeight - rect.height - 4))}px`;
		element.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus({ preventScroll: true });
	}, [position, items]);
	useEffect(() => {
		if (!position) return;
		const dismissOutside = (event: Event) => { if (!menu.current?.contains(event.target as Node)) onClose(); };
		// Capture phase on window runs before any other key handler, so Escape only closes the menu.
		const dismissOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } };
		window.addEventListener("pointerdown", dismissOutside, true);
		window.addEventListener("keydown", dismissOnEscape, true);
		window.addEventListener("resize", onClose);
		window.addEventListener("scroll", onClose, true);
		return () => {
			window.removeEventListener("pointerdown", dismissOutside, true);
			window.removeEventListener("keydown", dismissOnEscape, true);
			window.removeEventListener("resize", onClose);
			window.removeEventListener("scroll", onClose, true);
		};
	}, [position, onClose]);
	const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
		const entries = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)") ?? [])];
		const index = entries.indexOf(window.document.activeElement as HTMLElement);
		const next = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : null;
		if (next === null || !entries.length) return;
		event.preventDefault();
		entries[(next + entries.length) % entries.length]?.focus();
	};
	if (!position) return null;
	return createPortal(<div ref={menu} role="menu" className="si-menu context-menu" style={{ left: position.x, top: position.y }} onKeyDown={moveFocus} onContextMenu={(event) => event.preventDefault()}>
		{items.map((item, index) => item === "separator"
			? <hr key={`separator-${index}`} />
			: "heading" in item
			? <div key={`heading-${index}`} className="context-menu-heading" role="presentation">{item.heading}</div>
			: <button key={item.id ?? String(index)} type="button" role="menuitem" className={`si-menu-item ${item.danger ? "is-danger" : ""}`} disabled={item.disabled} onClick={() => { onClose(); item.onClick(); }}><span>{item.label}</span>{item.shortcut ? <kbd>{item.shortcut}</kbd> : null}</button>)}
	</div>, window.document.body);
}
