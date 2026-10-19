import type { MouseEventHandler, PointerEventHandler, ReactNode } from "react";
import { IconButton } from "../ui";
import { IconChevronDown } from "../ui/icons";

interface CollapsibleContentProps {
	id?: string;
	collapsed: boolean;
	onCollapsedChange: (collapsed: boolean) => void;
	className?: string;
	depth?: number;
	heading: ReactNode;
	headingClassName?: string;
	leadingActions?: ReactNode;
	trailingActions?: ReactNode;
	children: ReactNode;
	expandLabel?: string;
	collapseLabel?: string;
	onHeadingClick?: MouseEventHandler<HTMLDivElement>;
	onHeadingDoubleClick?: MouseEventHandler<HTMLDivElement>;
	onTogglePointerDown?: PointerEventHandler<HTMLButtonElement>;
}

export function CollapsibleContent({
	id,
	collapsed,
	onCollapsedChange,
	className = "",
	depth,
	heading,
	headingClassName = "",
	leadingActions,
	trailingActions,
	children,
	expandLabel = "展开内容",
	collapseLabel = "收起内容",
	onHeadingClick,
	onHeadingDoubleClick,
	onTogglePointerDown,
}: CollapsibleContentProps) {
	const actionLabel = collapsed ? expandLabel : collapseLabel;
	return <div id={id} className={`read-node collapsible-content ${className} ${collapsed ? "is-collapsed" : "is-expanded"}`} data-depth={depth}>
		<div className={`read-node-heading ${headingClassName}`} onClick={onHeadingClick} onDoubleClick={onHeadingDoubleClick}>
			{leadingActions}
			{heading}
			<IconButton
				className="fold-toggle-button"
				aria-label={actionLabel}
				title={actionLabel}
				aria-expanded={!collapsed}
				onPointerDown={(event) => { event.stopPropagation(); onTogglePointerDown?.(event); }}
				onClick={(event) => { event.stopPropagation(); onCollapsedChange(!collapsed); }}
				onDoubleClick={(event) => event.stopPropagation()}
			>
				<IconChevronDown className="fold-toggle-icon" />
			</IconButton>
			{trailingActions}
		</div>
		<div className="collapsible-content-region" inert={collapsed || undefined}>
			<div className="collapsible-content-inner"><div className="read-node-children">{children}</div></div>
		</div>
	</div>;
}
