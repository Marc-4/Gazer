import type { ReactNode } from "react";

export function PageHeader({
	eyebrow,
	title,
	description,
	action,
}: {
	eyebrow?: string;
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div className="space-y-1.5">
				{eyebrow ? (
					<p className="island-kicker text-xs font-bold uppercase tracking-[0.16em]">
						{eyebrow}
					</p>
				) : null}
				<h1 className="font-[Fraunces,Georgia,serif] text-3xl font-bold tracking-tight text-foreground">
					{title}
				</h1>
				{description ? (
					<p className="max-w-2xl text-sm text-muted-foreground">
						{description}
					</p>
				) : null}
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
}
