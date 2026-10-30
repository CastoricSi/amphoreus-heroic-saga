import type { ReactNode } from "react";
import { IconButton, Tag } from "sityle";
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
			<header><div><strong>{title}</strong>{count === undefined ? null : <Tag tone="azure">{count}</Tag>}</div><IconButton label={`关闭${title}`} onClick={onClose}><IconX /></IconButton></header>
			{children}
		</aside>
	</div>;
}
