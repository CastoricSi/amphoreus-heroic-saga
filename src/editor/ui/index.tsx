import type { ComponentPropsWithRef, HTMLAttributes, KeyboardEvent } from "react";

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
