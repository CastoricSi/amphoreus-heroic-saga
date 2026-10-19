import type { ReactNode } from "react";
import { Badge, IconButton } from "../ui";
import { IconX } from "../ui/icons";

interface SideOverlayProps {
	opened: boolean;
	title: string;
	count?: number;
	className?: string;
	onClose: () => void;
	children: ReactNode;
}

/** Panel that slides in over the right edge of the source pane; clicking the backdrop closes it. */
export function SideOverlay({ opened, title, count, className = "", onClose, children }: SideOverlayProps) {
	if (!opened) return null;
	return <div className="side-overlay-backdrop" onClick={onClose}>
		<aside className={`side-overlay ${className}`} role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()}>
			<header><div><strong>{title}</strong>{count === undefined ? null : <Badge color="blue" size="xs">{count}</Badge>}</div><IconButton aria-label={`关闭${title}`} size="sm" onClick={onClose}><IconX /></IconButton></header>
			{children}
		</aside>
	</div>;
}
