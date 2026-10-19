import type { SVGProps } from "react";

// Outline icons inlined from Tabler Icons (MIT, https://tabler.io/icons).
type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function createIcon(paths: string[]) {
	return function Icon({ size = 16, ...props }: IconProps) {
		return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths.map((d) => <path key={d} d={d} />)}</svg>;
	};
}

export const IconArrowBackUp = createIcon(["M9 14l-4 -4l4 -4", "M5 10h11a4 4 0 1 1 0 8h-1"]);
export const IconArrowForwardUp = createIcon(["M15 14l4 -4l-4 -4", "M19 10h-11a4 4 0 1 0 0 8h1"]);
export const IconArrowLeft = createIcon(["M5 12l14 0", "M5 12l6 6", "M5 12l6 -6"]);
export const IconBooks = createIcon(["M5 5a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -14", "M9 5a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -14", "M5 8h4", "M9 16h4", "M13.803 4.56l2.184 -.53c.562 -.135 1.133 .19 1.282 .732l3.695 13.418a1.02 1.02 0 0 1 -.634 1.219l-.133 .041l-2.184 .53c-.562 .135 -1.133 -.19 -1.282 -.732l-3.695 -13.418a1.02 1.02 0 0 1 .634 -1.219l.133 -.041", "M14 9l4 -1", "M16 16l3.923 -.98"]);
export const IconChevronDown = createIcon(["M6 9l6 6l6 -6"]);
export const IconChevronLeft = createIcon(["M15 6l-6 6l6 6"]);
export const IconChevronRight = createIcon(["M9 6l6 6l-6 6"]);
export const IconCopy = createIcon(["M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666", "M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"]);
export const IconGripVertical = createIcon(["M8 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M8 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M8 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M14 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M14 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"]);
export const IconLanguageHiragana = createIcon(["M4 5h7", "M7 4c0 4.846 0 7 .5 8", "M10 8.5c0 2.286 -2 4.5 -3.5 4.5s-2.5 -1.135 -2.5 -2c0 -2 1 -3 3 -3s5 .57 5 2.857c0 1.524 -.667 2.571 -2 3.143", "M12 20l4 -9l4 9", "M19.1 18h-6.2"]);
export const IconListTree = createIcon(["M9 6h11", "M12 12h8", "M15 18h5", "M5 6v.01", "M8 12v.01", "M11 18v.01"]);
export const IconMapPin = createIcon(["M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0", "M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0"]);
export const IconPlayerPlay = createIcon(["M7 4v16l13 -8l-13 -8"]);
export const IconPlayerStop = createIcon(["M5 7a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -10"]);
export const IconPlus = createIcon(["M12 5l0 14", "M5 12l14 0"]);
export const IconSearch = createIcon(["M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-6 -6"]);
export const IconSettings = createIcon(["M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065", "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"]);
export const IconX = createIcon(["M18 6l-12 12", "M6 6l12 12"]);
