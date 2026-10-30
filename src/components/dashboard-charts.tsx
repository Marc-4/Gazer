import { cn } from "#/lib/utils";

interface TrendPoint {
	date: string;
	count: number;
}

export function Sparkline({
	data,
	className,
}: {
	data: TrendPoint[];
	className?: string;
}) {
	if (data.length === 0) {
		return <div className={cn("h-16 w-full", className)} />;
	}

	const max = Math.max(1, ...data.map((point) => point.count));
	const width = 100;
	const height = 32;
	const step = data.length > 1 ? width / (data.length - 1) : width;
	const points = data.map((point, index) => {
		const x = index * step;
		const y = height - 2 - (point.count / max) * (height - 4);
		return `${x.toFixed(2)},${y.toFixed(2)}`;
	});
	const line = points.join(" ");
	const area = `0,${height} ${line} ${width},${height}`;

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
			className={cn("h-16 w-full overflow-visible", className)}
			role="img"
			aria-label="Demand trend"
		>
			<polygon points={area} className="fill-current opacity-10" />
			<polyline
				points={line}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				strokeLinejoin="round"
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

export function MiniBars({
	data,
	labelFormat,
	className,
}: {
	data: TrendPoint[];
	labelFormat?: (date: string) => string;
	className?: string;
}) {
	const max = Math.max(1, ...data.map((point) => point.count));

	return (
		<div className={cn("flex h-28 items-end gap-1", className)}>
			{data.map((point) => (
				<div
					key={point.date}
					className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5"
					title={`${point.date}: ${point.count} booking${point.count === 1 ? "" : "s"}`}
				>
					<div className="flex flex-1 items-end">
						<div
							className="w-full rounded-t-[3px] bg-[#2451d8]/70 transition-colors group-hover:bg-[#2451d8] dark:bg-[#f0c75e]/60 dark:group-hover:bg-[#f0c75e]"
							style={{
								height: `${Math.max((point.count / max) * 100, point.count === 0 ? 2 : 4)}%`,
							}}
						/>
					</div>
					{labelFormat ? (
						<span className="truncate text-center text-[10px] leading-none text-muted-foreground">
							{labelFormat(point.date)}
						</span>
					) : null}
				</div>
			))}
		</div>
	);
}

export function SegmentedBar({
	segments,
	total,
	className,
}: {
	segments: Array<{ label: string; value: number; className: string }>;
	total?: number;
	className?: string;
}) {
	const sum = segments.reduce((acc, segment) => acc + segment.value, 0);
	const denominator = total ?? sum;

	return (
		<div
			className={cn(
				"flex h-2.5 w-full overflow-hidden rounded-full bg-muted",
				className,
			)}
		>
			{denominator > 0
				? segments
						.filter((segment) => segment.value > 0)
						.map((segment) => (
							<div
								key={segment.label}
								className={segment.className}
								style={{
									width: `${(segment.value / denominator) * 100}%`,
								}}
								title={`${segment.label}: ${segment.value}`}
							/>
						))
				: null}
		</div>
	);
}

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
const hourLabels = Array.from({ length: 24 }, (_, hour) => String(hour));

export function PeakHeatmap({
	cells,
	className,
}: {
	cells: Array<{ dow: number; hour: number; count: number }>;
	className?: string;
}) {
	const lookup = new Map(
		cells.map((cell) => [`${cell.dow}-${cell.hour}`, cell.count]),
	);
	const max = Math.max(1, ...cells.map((cell) => cell.count));

	return (
		<div className={cn("overflow-x-auto", className)}>
			<div className="min-w-[520px]">
				<div className="flex gap-1 pl-9 text-[10px] text-muted-foreground">
					{hourLabels.map((hour) => (
						<span key={hour} className="flex-1 text-center tabular-nums">
							{Number(hour) % 3 === 0 ? hour : ""}
						</span>
					))}
				</div>
				{weekdayOrder.map((dow) => (
					<div key={dow} className="mt-1 flex items-center gap-1">
						<span className="w-8 shrink-0 text-[11px] text-muted-foreground">
							{dayLabels[dow]}
						</span>
						{hourLabels.map((hour) => {
							const count = lookup.get(`${dow}-${hour}`) ?? 0;
							const intensity = count === 0 ? 0.06 : 0.2 + (count / max) * 0.8;
							return (
								<div
									key={`${dow}-${hour}`}
									className="h-5 flex-1 rounded-[3px] bg-[#2451d8] dark:bg-[#f0c75e]"
									style={{ opacity: intensity }}
									title={`${dayLabels[dow]} ${hour}:00 — ${count} request${count === 1 ? "" : "s"}`}
								/>
							);
						})}
					</div>
				))}
				<div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
					<span>Less</span>
					{[0.1, 0.3, 0.5, 0.7, 0.9].map((opacity) => (
						<span
							key={opacity}
							className="size-2.5 rounded-[2px] bg-[#2451d8] dark:bg-[#f0c75e]"
							style={{ opacity }}
						/>
					))}
					<span>More</span>
				</div>
			</div>
		</div>
	);
}
