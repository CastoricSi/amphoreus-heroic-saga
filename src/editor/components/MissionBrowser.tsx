import { NavLink, Select, TextInput } from "../ui";
import { IconMapPin, IconSearch } from "../ui/icons";
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

/** Mission filters plus the location → series → mission list; used by the sidebar and the focus-mode overlay. */
export function MissionBrowser({ groups, selectedFile, search, category, location, categories, locations, onSearchChange, onCategoryChange, onLocationChange, onOpen }: MissionBrowserProps) {
	return <div className="mission-browser">
		<div className="mission-browser-filters">
			<TextInput size="sm" leftSection={<IconSearch size={14} />} placeholder="搜索任务、系列或地点" value={search} onChange={(event) => onSearchChange(event.target.value)} />
			<Select aria-label="按任务种类筛选" value={category} onChange={onCategoryChange} data={[{ value: "", label: "所有任务种类" }, ...categories.map((item) => ({ value: item, label: item }))]} />
			<Select leftSection={<IconMapPin size={14} />} aria-label="按地点筛选" value={location} onChange={onLocationChange} data={[{ value: "", label: "所有地点" }, ...locations.map((item) => ({ value: item, label: item }))]} />
		</div>
		<nav className="mission-list">{groups.length ? groups.map((group) => <section className="mission-location" key={group.location}>
			<h3>{group.location}</h3>
			{group.series.map((series) => <div className="mission-series" key={series.name}>
				<h4>{series.name}</h4>
				{series.entries.map((mission) => <NavLink key={mission.dataFile} className="mission-item" active={mission.dataFile === selectedFile} title={`${mission.category} / ${mission.location} / ${mission.series} / ${mission.name}`} label={mission.name} onClick={() => onOpen(mission)} />)}
			</div>)}
		</section>) : <p className="mission-empty">没有符合条件的任务</p>}</nav>
	</div>;
}
