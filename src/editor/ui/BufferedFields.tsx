import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

type BufferedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> & {
	value: string;
	onValueChange: (value: string) => void;
};

type BufferedTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "defaultValue" | "onChange"> & {
	value: string;
	onValueChange: (value: string) => void;
};

function useBufferedText(value: string, onValueChange: (value: string) => void) {
	const [buffer, setBuffer] = useState({ source: value, draft: value });
	const latestValue = useRef(value);
	const timer = useRef<number | null>(null);
	const draft = buffer.source === value ? buffer.draft : value;

	useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
	useEffect(() => { latestValue.current = value; }, [value]);

	const commit = (next: string) => {
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = null;
		if (next === latestValue.current) return;
		latestValue.current = next;
		onValueChange(next);
	};
	const change = (next: string) => {
		setBuffer({ source: value, draft: next });
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => commit(next), 180);
	};
	return { draft, change, commit };
}

export function BufferedInput({ value, onValueChange, onBlur, onKeyDown, className = "", ...props }: BufferedInputProps) {
	const buffered = useBufferedText(value, onValueChange);
	return <input {...props} className={`ui-field ui-input ${className}`} value={buffered.draft} onChange={(event) => buffered.change(event.target.value)} onBlur={(event) => { buffered.commit(event.currentTarget.value); onBlur?.(event); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") buffered.commit(event.currentTarget.value); onKeyDown?.(event); }} />;
}

export function BufferedTextarea({ value, onValueChange, onBlur, onKeyDown, className = "", ...props }: BufferedTextareaProps) {
	const buffered = useBufferedText(value, onValueChange);
	return <textarea {...props} className={`ui-field ${className}`} value={buffered.draft} onChange={(event) => buffered.change(event.target.value)} onBlur={(event) => { buffered.commit(event.currentTarget.value); onBlur?.(event); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") buffered.commit(event.currentTarget.value); onKeyDown?.(event); }} />;
}
