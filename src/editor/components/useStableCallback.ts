import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A function that keeps one identity for the component's lifetime but always runs the latest `callback`.
 * Lets memoized children (the long content lists) skip re-rendering when the parent re-renders for
 * something unrelated, without handing them stale handlers.
 */
export function useStableCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
	const latest = useRef(callback);
	useLayoutEffect(() => {
		latest.current = callback;
	});
	return useCallback((...args: Args) => latest.current(...args), []);
}
