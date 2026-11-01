import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

/**
 * The content width of an element, kept up to date while it resizes (0 until it is first measured).
 * Returns a callback ref, so an element that mounts later (or is replaced) is measured too, and
 * `measure()`, which reads the width right away and renders with it synchronously: for a layout change
 * that has to be complete in one go (a view transition's "after" snapshot).
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
	const measure = useCallback(() => {
		if (element) flushSync(() => setWidth(element.clientWidth));
	}, [element]);
	return [setElement, width, measure] as const;
}
