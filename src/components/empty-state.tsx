import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
}: {
	icon: LucideIcon;
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-card/40 px-6 py-14 text-center">
			<div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
				<Icon className="size-5" />
			</div>
			<div className="space-y-1">
				<p className="font-semibold text-foreground">{title}</p>
				{description ? (
					<p className="mx-auto max-w-md text-sm text-muted-foreground">
						{description}
					</p>
				) : null}
			</div>
			{action ? <div className="pt-1">{action}</div> : null}
		</div>
	);
}
