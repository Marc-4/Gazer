import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { cn } from "#/lib/utils";

export interface FilterOption {
	value: string;
	label: string;
}

export function FilterSelect({
	value,
	onValueChange,
	options,
	placeholder,
	ariaLabel,
	className,
}: {
	value: string;
	onValueChange: (value: string) => void;
	options: FilterOption[];
	placeholder?: string;
	ariaLabel: string;
	className?: string;
}) {
	return (
		<Select value={value} onValueChange={onValueChange}>
			<SelectTrigger
				className={cn("w-full sm:w-48", className)}
				aria-label={ariaLabel}
			>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
