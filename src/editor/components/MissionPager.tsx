import { Button } from "../ui";
import { IconChevronLeft, IconChevronRight } from "../ui/icons";
import type { MissionRef } from "../content/types";

interface MissionPagerProps {
	previous: MissionRef | null;
	next: MissionRef | null;
	position: number;
	total: number;
	onOpen: (mission: MissionRef) => void;
}

export function MissionPager({ previous, next, position, total, onOpen }: MissionPagerProps) {
	const progress = position >= 0 ? `${position + 1} / ${total}` : `— / ${total}`;
	return <nav className="mission-pager" aria-label="切换任务">
		<Button variant="subtle" color="gray" size="sm" disabled={!previous} onClick={() => previous && onOpen(previous)} icon={<IconChevronLeft size={14} />}><span className="mission-pager-copy"><strong>{previous?.name ?? "没有上一个任务"}</strong><small>{previous?.series ?? "已到任务列表开头"}</small></span></Button>
		<span className="mission-pager-position">{progress}</span>
		<Button variant="subtle" color="gray" size="sm" disabled={!next} onClick={() => next && onOpen(next)}><span className="mission-pager-copy"><strong>{next?.name ?? "没有下一个任务"}</strong><small>{next?.series ?? "已到任务列表末尾"}</small></span><IconChevronRight size={14} /></Button>
	</nav>;
}
