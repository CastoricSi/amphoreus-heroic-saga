import { useEffect, useRef } from "react";
import { NavItem, SearchField, Segmented, SelectField } from "sityle";
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

/** Mission filters plus the location → series → mission list. Its columns follow its own width. */
export function MissionBrowser({ groups, selectedFile, search, category, location, categories, locations, onSearchChange, onCategoryChange, onLocationChange, onOpen }: MissionBrowserProps) {
	const list = useRef<HTMLElement>(null);
	// Keep the open mission in view: on coming back to the list, and when the pager moves to another one.
	useEffect(() => { list.current?.querySelector(".mission-item[aria-current]")?.scrollIntoView({ block: "nearest" }); }, [selectedFile]);
	return <div className="mission-browser">
		<div className="mission-browser-filters">
			<SearchField label="搜索任务" placeholder="搜索任务、系列或地点" value={search} onChange={onSearchChange} />
			<Segmented label="任务种类" className="mission-category" value={category} onChange={onCategoryChange} options={[{ value: "", label: "全部" }, ...categories.map((item) => ({ value: item, label: item }))]} />
			<SelectField label="地点" value={location} onChange={onLocationChange} options={[{ value: "", label: "所有地点" }, ...locations.map((item) => ({ value: item, label: item }))]} />
		</div>
		<nav ref={list} className="mission-list" aria-label="任务列表">{groups.length ? groups.map((group) => <section className="mission-location" key={group.location}>
			<h3>{group.location}</h3>
			{group.series.map((series) => <div className="mission-series" key={series.name}>
				<h4>{series.name}</h4>
				{series.entries.map((mission) => <NavItem key={mission.dataFile} className="mission-item" current={mission.dataFile === selectedFile} title={`${mission.category} / ${mission.location} / ${mission.series} / ${mission.name}`} label={mission.name} onClick={() => onOpen(mission)} />)}
			</div>)}
		</section>) : <p className="mission-empty">没有符合条件的任务</p>}</nav>
	</div>;
}
