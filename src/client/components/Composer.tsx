import { useState } from "react";

export function Composer({
	placeholder,
	submitLabel,
	autoFocus,
	onSubmit,
	onCancel,
}: {
	placeholder: string;
	submitLabel: string;
	autoFocus?: boolean;
	onSubmit: (body: string) => Promise<void>;
	onCancel?: () => void;
}) {
	const [value, setValue] = useState("");
	const [busy, setBusy] = useState(false);

	const submit = async () => {
		if (!value.trim() || busy) return;
		setBusy(true);
		try {
			await onSubmit(value.trim());
			setValue("");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="composer">
			<textarea
				className="input"
				rows={value.includes("\n") ? 4 : 2}
				autoFocus={autoFocus}
				placeholder={placeholder}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
					if (e.key === "Escape") onCancel?.();
				}}
			/>
			<div className="composer-row">
				<span className="hint">markdown · ⌘↵ to send</span>
				<span className="spacer" />
				{onCancel && (
					<button type="button" className="btn ghost sm" onClick={onCancel}>
						Cancel
					</button>
				)}
				<button type="button" className="btn primary sm" disabled={!value.trim() || busy} onClick={() => void submit()}>
					{submitLabel}
				</button>
			</div>
		</div>
	);
}
