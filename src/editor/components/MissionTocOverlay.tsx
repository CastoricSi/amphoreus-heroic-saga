import { Badge, IconButton, NavLink, Select, TextInput } from "../ui";
import { IconMapPin, IconSearch, IconX } from "../ui/icons";
import type { MissionRef } from "../content/types";

interface MissionTocGroup {
	location: string;
	series: Array<{ name: string; entries: MissionRef[] }>;
}

interface MissionTocOverlayProps {
	opened: boolean;
	groups: MissionTocGroup[];
	selectedFile?: string;
	total: number;
	search: string;
	category: string;
	location: string;
	categories: string[];
	locations: string[];
	onClose: () => void;
	onOpen: (mission: MissionRef) => void;
	onSearchChange: (value: string) => void;
	onCategoryChange: (value: string) => void;
	onLocationChange: (value: string) => void;
}

export function MissionTocOverlay({ opened, groups, selectedFile, total, search, category, location, categories, locations, onClose, onOpen, onSearchChange, onCategoryChange, onLocationChange }: MissionTocOverlayProps) {
	if (!opened) return null;
	return <div className="mission-toc-backdrop" onClick={onClose}>
		<aside className="mission-toc-overlay" role="dialog" aria-label="任务目录" onClick={(event) => event.stopPropagation()}>
			<header><div><strong>任务目录</strong><Badge color="blue" size="xs">{total}</Badge></div><IconButton aria-label="关闭任务目录" size="sm" onClick={onClose}><IconX /></IconButton></header>
			<div className="mission-toc-filters">
				<TextInput size="sm" leftSection={<IconSearch size={14} />} placeholder="搜索任务、系列或地点" value={search} onChange={(event) => onSearchChange(event.target.value)} />
				<Select aria-label="按任务种类筛选" value={category} onChange={onCategoryChange} data={[{ value: "", label: "所有任务种类" }, ...categories.map((item) => ({ value: item, label: item }))]} />
				<Select leftSection={<IconMapPin size={14} />} aria-label="按地点筛选" value={location} onChange={onLocationChange} data={[{ value: "", label: "所有地点" }, ...locations.map((item) => ({ value: item, label: item }))]} />
			</div>
			<nav>{groups.length ? groups.map((location) => <section className="mission-toc-location" key={location.location}><h3>{location.location}</h3>{location.series.map((series) => <div className="mission-toc-series" key={series.name}><h4>{series.name}</h4>{series.entries.map((mission) => <NavLink key={mission.dataFile} className="mission-toc-item" active={mission.dataFile === selectedFile} label={mission.name} title={`${mission.location} / ${mission.series} / ${mission.name}`} onClick={() => { onOpen(mission); onClose(); }} />)}</div>)}</section>) : <p>没有符合当前筛选条件的任务</p>}</nav>
		</aside>
	</div>;
}
