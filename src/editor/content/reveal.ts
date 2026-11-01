/**
 * Scrolls an element into view inside its scrolling list, and makes sure it gets there.
 *
 * The long content lists skip laying out blocks that are off screen (content-visibility: auto), so a
 * smooth scroll to a far block aims with estimated heights: the blocks it passes take their real height
 * on the way and the target ends up short of where it should be. After the scroll ends this checks where
 * the element really is and corrects (instantly, a frame apart) until it holds, a few times at most.
 */
// Only the latest reveal settles: a new jump before the last one held takes over.
let latestReveal = 0;

export function revealElement(element: HTMLElement, block: "start" | "center" = "start") {
	const reveal = ++latestReveal;
	const scroller = scrollingAncestor(element);
	element.scrollIntoView({ block, behavior: "smooth" });
	if (!scroller) return;
	let passes = 0;
	const settle = () => {
		if (reveal !== latestReveal || !element.isConnected) return;
		const box = scroller.getBoundingClientRect();
		const target = element.getBoundingClientRect();
		const wanted = block === "start" ? box.top : box.top + (box.height - target.height) / 2;
		const atEnd = scroller.scrollTop <= 0 || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
		if (Math.abs(target.top - wanted) <= 2 || (atEnd && passes > 0) || passes >= 4) return;
		passes += 1;
		element.scrollIntoView({ block, behavior: "instant" });
		// Blocks that just came into view are laid out in the next frame; look again after it.
		requestAnimationFrame(() => requestAnimationFrame(settle));
	};
	// The smooth scroll ends with scrollend; if there was nothing to scroll, it never fires.
	const fallback = window.setTimeout(settle, 1200);
	scroller.addEventListener("scrollend", () => { window.clearTimeout(fallback); settle(); }, { once: true });
}

function scrollingAncestor(element: HTMLElement) {
	for (let node = element.parentElement; node; node = node.parentElement) {
		const overflow = getComputedStyle(node).overflowY;
		if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) return node;
	}
	return null;
}
