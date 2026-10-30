import { useEffect, useRef, useState } from "react";

/** The content width of an element, kept up to date while it resizes (0 until it is first measured). */
export function useElementWidth<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		// A ResizeObserver reports once right after observe(), so no separate first measurement is needed.
		const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return [ref, width] as const;
}
