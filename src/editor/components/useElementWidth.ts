import { useEffect, useState } from "react";

/**
 * The content width of an element, kept up to date while it resizes (0 until it is first measured).
 * Returns a callback ref, so an element that mounts later (or is replaced) is measured too.
 */
export function useElementWidth<T extends HTMLElement>() {
	const [element, setElement] = useState<T | null>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		if (!element) return;
		// A ResizeObserver reports once right after observe(), so no separate first measurement is needed.
		const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
		observer.observe(element);
		return () => observer.disconnect();
	}, [element]);
	return [setElement, width] as const;
}
