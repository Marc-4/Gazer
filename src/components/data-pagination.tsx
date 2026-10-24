import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { PAGE_SIZE_OPTIONS } from "#/lib/admin-queries";

export function DataPagination({
	page,
	pageSize,
	total,
	itemLabel,
	onPageChange,
	onPageSizeChange,
}: {
	page: number;
	pageSize: number;
	total: number;
	itemLabel: string;
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
}) {
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const to = Math.min(page * pageSize, total);

	return (
		<div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
			<p className="text-xs text-muted-foreground">
				Showing {from}–{to} of {total} {itemLabel}
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<Select
					value={String(pageSize)}
					onValueChange={(value) => onPageSizeChange(Number(value))}
				>
					<SelectTrigger
						className="h-8 w-auto min-w-[7rem]"
						aria-label="Rows per page"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PAGE_SIZE_OPTIONS.map((option) => (
							<SelectItem key={option} value={String(option)}>
								{option} / page
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(page - 1)}
					disabled={page <= 1}
				>
					<ChevronLeft className="size-4" />
					Previous
				</Button>
				<span className="text-xs font-medium text-muted-foreground">
					Page {page} of {pageCount}
				</span>
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(page + 1)}
					disabled={page >= pageCount}
				>
					Next
					<ChevronRight className="size-4" />
				</Button>
			</div>
		</div>
	);
}
