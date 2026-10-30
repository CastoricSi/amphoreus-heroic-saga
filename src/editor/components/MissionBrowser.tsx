import { useEffect, useRef } from "react";
import { NavItem, SearchField, Select } from "sityle";
import type { MissionRef } from "../content/types";

export interface MissionGroup {
	location: string;
	series: Array<{ name: string; entries: MissionRef[] }>;
}

export interface MissionBrowserProps {
	groups: MissionGroup[];
	selectedFile?: string;
	search: string;
	category: string;
	location: string;
	categories: string[];
	locations: string[];
	onSearchChange: (value: string) => void;
	onCategoryChange: (value: string) => void;
	onLocationChange: (value: string) => void;
	onOpen: (mission: MissionRef) => void;
}

/** Mission filters plus the location → series → mission list shown when no mission is open. */
export function MissionBrowser({ groups, selectedFile, search, category, location, categories, locations, onSearchChange, onCategoryChange, onLocationChange, onOpen }: MissionBrowserProps) {
	const list = useRef<HTMLElement>(null);
	// Coming back from a mission: bring the one just viewed into view.
	useEffect(() => { list.current?.querySelector(".mission-item[aria-current]")?.scrollIntoView({ block: "center" }); }, []);
	return <div className="mission-browser">
		<div className="mission-browser-filters">
			<SearchField label="搜索任务" placeholder="搜索任务、系列或地点" value={search} onChange={onSearchChange} />
			<Select aria-label="按任务种类筛选" value={category} onChange={(event) => onCategoryChange(event.target.value)}>
				<option value="">所有任务种类</option>
				{categories.map((item) => <option key={item} value={item}>{item}</option>)}
			</Select>
			<Select aria-label="按地点筛选" value={location} onChange={(event) => onLocationChange(event.target.value)}>
				<option value="">所有地点</option>
				{locations.map((item) => <option key={item} value={item}>{item}</option>)}
			</Select>
		</div>
		<nav ref={list} className="mission-list">{groups.length ? groups.map((group) => <section className="mission-location" key={group.location}>
			<h3>{group.location}</h3>
			{group.series.map((series) => <div className="mission-series" key={series.name}>
				<h4>{series.name}</h4>
				{series.entries.map((mission) => <NavItem key={mission.dataFile} className="mission-item" current={mission.dataFile === selectedFile} title={`${mission.category} / ${mission.location} / ${mission.series} / ${mission.name}`} label={mission.name} onClick={() => onOpen(mission)} />)}
			</div>)}
		</section>) : <p className="mission-empty">没有符合条件的任务</p>}</nav>
	</div>;
}
