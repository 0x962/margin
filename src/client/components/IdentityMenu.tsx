import { UserRound } from "lucide-react";
import { useState } from "react";
import { useIdentity } from "../lib";

/** The reviewer's display name, shown on every comment they write here. */
export function IdentityMenu() {
	const { author, set } = useIdentity();
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState(author);

	if (editing) {
		return (
			<input
				className="input identity-input"
				autoFocus
				placeholder="your name"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={() => {
					set(value.trim());
					setEditing(false);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") (e.target as HTMLInputElement).blur();
					if (e.key === "Escape") setEditing(false);
				}}
			/>
		);
	}
	return (
		<button type="button" className="btn ghost identity" title="Comments you write here carry this name" onClick={() => setEditing(true)}>
			<UserRound size={12} />
			{author || "set your name"}
		</button>
	);
}
