import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Search, Trash2, UserPlus, Users } from "lucide-react";
import { type FormEvent, type MouseEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { DataPagination } from "#/components/data-pagination";
import { EmptyState } from "#/components/empty-state";
import { FilterSelect } from "#/components/filter-select";
import { PageHeader } from "#/components/page-header";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
	fetchUserCounts,
	fetchUsersPage,
	type UserFilter,
	type UserStatusFilter,
} from "#/lib/admin-queries";
import { useAuth } from "#/lib/auth";
import { formatDate } from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { AppRole, Profile } from "#/lib/types";
import { useDebouncedValue } from "#/lib/use-debounced-value";

export const Route = createFileRoute("/admin/users")({
	component: AdminUsers,
});

const filters: Array<{ value: UserFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "admin", label: "Admins" },
	{ value: "booker", label: "Bookers" },
];

const statusFilters: Array<{ value: UserStatusFilter; label: string }> = [
	{ value: "all", label: "All statuses" },
	{ value: "active", label: "Active" },
	{ value: "inactive", label: "Inactive" },
];

async function adminRequest(path: string, init: RequestInit) {
	const {
		data: { session },
	} = await supabase.auth.getSession();

	if (!session) throw new Error("Your session has expired. Sign in again.");

	const response = await fetch(path, {
		...init,
		headers: {
			...init.headers,
			Authorization: `Bearer ${session.access_token}`,
			"Content-Type": "application/json",
		},
	});

	const payload = (await response.json().catch(() => null)) as {
		error?: string;
	} | null;

	if (!response.ok) {
		throw new Error(payload?.error ?? "The request could not be completed.");
	}

	return payload;
}

function roleLabel(role: AppRole) {
	return role === "admin" ? "Admin" : "Booker";
}

function AdminUsers() {
	const { user: currentUser } = useAuth();
	const [users, setUsers] = useState<Profile[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<UserFilter>("all");
	const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [total, setTotal] = useState(0);
	const [counts, setCounts] = useState({
		total: 0,
		admins: 0,
		inactive: 0,
	});
	const [refreshKey, setRefreshKey] = useState(0);
	const [inviteOpen, setInviteOpen] = useState(false);
	const [editing, setEditing] = useState<Profile | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
	const debouncedQuery = useDebouncedValue(query);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey intentionally retriggers the query after mutations.
	useEffect(() => {
		let active = true;
		setLoading(true);

		Promise.all([
			fetchUsersPage({
				page,
				pageSize,
				filter,
				status: statusFilter,
				query: debouncedQuery,
			}),
			fetchUserCounts(),
		])
			.then(([result, nextCounts]) => {
				if (!active) return;
				const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
				if (page > pageCount) {
					setPage(pageCount);
					return;
				}
				setUsers(result.rows);
				setTotal(result.total);
				setCounts(nextCounts);
				setLoading(false);
			})
			.catch((error: unknown) => {
				if (!active) return;
				toast.error(
					error instanceof Error ? error.message : "Unable to load users.",
				);
				setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [page, pageSize, filter, statusFilter, debouncedQuery, refreshKey]);

	const refresh = () => setRefreshKey((key) => key + 1);

	return (
		<div>
			<PageHeader
				eyebrow="Access management"
				title="Users"
				description="Invite users, update their details, and control administrator access."
				action={
					<Button onClick={() => setInviteOpen(true)}>
						<UserPlus className="size-4" />
						Invite user
					</Button>
				}
			/>

			<Card className="mt-6 border-border/70">
				<CardHeader className="gap-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
								People with access
							</CardTitle>
							<CardDescription>
								{total} of {counts.total} users · {counts.admins} admins ·{" "}
								{counts.inactive} inactive
							</CardDescription>
						</div>
						<div className="relative w-full sm:w-72">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={query}
								onChange={(event) => {
									setQuery(event.target.value);
									setPage(1);
								}}
								placeholder="Search name, email, organization…"
								className="pl-9"
							/>
						</div>
					</div>
					<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
						<Tabs
							value={filter}
							onValueChange={(value) => {
								setFilter(value as UserFilter);
								setPage(1);
							}}
						>
							<TabsList className="w-full justify-start overflow-x-auto xl:w-auto">
								{filters.map((item) => (
									<TabsTrigger key={item.value} value={item.value}>
										{item.label}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>
						<FilterSelect
							value={statusFilter}
							onValueChange={(value) => {
								setStatusFilter(value as UserStatusFilter);
								setPage(1);
							}}
							options={statusFilters}
							ariaLabel="Filter users by account status"
						/>
					</div>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="space-y-2">
							{["s1", "s2", "s3", "s4", "s5", "s6"].map((key) => (
								<Skeleton key={key} className="h-14 rounded-lg" />
							))}
						</div>
					) : total === 0 ? (
						<EmptyState
							icon={Users}
							title="No users found"
							description={
								counts.total === 0
									? "Invite your first user to get started."
									: "Try a different filter or search term."
							}
						/>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>User</TableHead>
										<TableHead>Organization</TableHead>
										<TableHead>Role</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Joined</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{users.map((user) => {
										const isCurrentUser = user.id === currentUser?.id;
										return (
											<TableRow key={user.id}>
												<TableCell className="max-w-64">
													<div className="flex items-center gap-2">
														<p className="truncate font-medium">
															{user.full_name || "Unnamed user"}
														</p>
														{isCurrentUser ? (
															<Badge variant="secondary">You</Badge>
														) : null}
													</div>
													<p className="truncate text-xs text-muted-foreground">
														{user.email ?? "No email"}
													</p>
												</TableCell>
												<TableCell className="max-w-48 truncate text-sm">
													{user.organization || "—"}
												</TableCell>
												<TableCell>
													<Badge
														variant={
															user.role === "admin" ? "default" : "secondary"
														}
													>
														{roleLabel(user.role)}
													</Badge>
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className={
															user.is_active
																? "border-emerald-300/60 bg-emerald-100 font-semibold text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-200"
																: "border-slate-300/60 bg-slate-100 font-semibold text-slate-700 dark:border-slate-400/30 dark:bg-slate-400/15 dark:text-slate-200"
														}
													>
														{user.is_active ? "Active" : "Inactive"}
													</Badge>
												</TableCell>
												<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
													{formatDate(user.created_at)}
												</TableCell>
												<TableCell>
													<div className="flex justify-end gap-1">
														<Button
															variant="outline"
															size="sm"
															onClick={() => setEditing(user)}
														>
															<Pencil className="size-3.5" />
															Edit
														</Button>
														<Button
															variant="ghost"
															size="sm"
															className="text-destructive hover:text-destructive"
															disabled={isCurrentUser}
															onClick={() => setDeleteTarget(user)}
														>
															<Trash2 className="size-3.5" />
															Delete
														</Button>
													</div>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					)}
					{!loading && total > 0 ? (
						<DataPagination
							page={page}
							pageSize={pageSize}
							total={total}
							itemLabel="users"
							onPageChange={setPage}
							onPageSizeChange={(size) => {
								setPageSize(size);
								setPage(1);
							}}
						/>
					) : null}
				</CardContent>
			</Card>

			<InviteUserDialog
				open={inviteOpen}
				onOpenChange={setInviteOpen}
				onSaved={() => {
					setPage(1);
					refresh();
				}}
			/>

			<EditUserDialog
				user={editing}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				onSaved={() => {
					setEditing(null);
					refresh();
				}}
			/>

			<DeleteUserDialog
				user={deleteTarget}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
				onDeleted={() => {
					setDeleteTarget(null);
					setPage(1);
					refresh();
				}}
			/>
		</div>
	);
}

function InviteUserDialog({
	open,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [email, setEmail] = useState("");
	const [fullName, setFullName] = useState("");
	const [role, setRole] = useState<AppRole>("booker");
	const [saving, setSaving] = useState(false);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setEmail("");
			setFullName("");
			setRole("booker");
		}
		onOpenChange(nextOpen);
	};

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSaving(true);

		try {
			await adminRequest("/api/admin/users", {
				method: "POST",
				body: JSON.stringify({ email, fullName, role }),
			});
			toast.success(`Invitation sent to ${email}`);
			handleOpenChange(false);
			onSaved();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to invite user.",
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Invite user</DialogTitle>
					<DialogDescription>
						Send an email invitation. The new user will set their own password.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="invite-email">Email</Label>
						<Input
							id="invite-email"
							type="email"
							required
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							placeholder="name@school.edu"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="invite-name">Full name</Label>
						<Input
							id="invite-name"
							value={fullName}
							onChange={(event) => setFullName(event.target.value)}
							placeholder="Optional"
						/>
					</div>
					<div className="space-y-2">
						<Label>Role</Label>
						<Select
							value={role}
							onValueChange={(value) => setRole(value as AppRole)}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="booker">Booker</SelectItem>
								<SelectItem value="admin">Admin</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? "Sending…" : "Send invitation"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function EditUserDialog({
	user,
	onOpenChange,
	onSaved,
}: {
	user: Profile | null;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [fullName, setFullName] = useState("");
	const [organization, setOrganization] = useState("");
	const [phone, setPhone] = useState("");
	const [role, setRole] = useState<AppRole>("booker");
	const [active, setActive] = useState(true);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!user) return;
		setFullName(user.full_name ?? "");
		setOrganization(user.organization ?? "");
		setPhone(user.phone ?? "");
		setRole(user.role);
		setActive(user.is_active);
	}, [user]);

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!user) return;

		setSaving(true);
		try {
			await adminRequest("/api/admin/users", {
				method: "PATCH",
				body: JSON.stringify({
					id: user.id,
					full_name: fullName,
					organization,
					phone,
					role,
					is_active: active,
				}),
			});
			toast.success("User updated");
			onSaved();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to update user.",
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit user</DialogTitle>
					<DialogDescription>
						{user?.email ?? "Update user details"}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="edit-name">Full name</Label>
							<Input
								id="edit-name"
								value={fullName}
								onChange={(event) => setFullName(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="edit-organization">Organization</Label>
							<Input
								id="edit-organization"
								value={organization}
								onChange={(event) => setOrganization(event.target.value)}
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="edit-phone">Phone</Label>
						<Input
							id="edit-phone"
							value={phone}
							onChange={(event) => setPhone(event.target.value)}
						/>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label>Role</Label>
							<Select
								value={role}
								onValueChange={(value) => setRole(value as AppRole)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="booker">Booker</SelectItem>
									<SelectItem value="admin">Admin</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Account status</Label>
							<Select
								value={active ? "active" : "inactive"}
								onValueChange={(value) => setActive(value === "active")}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="active">Active</SelectItem>
									<SelectItem value="inactive">Inactive</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? "Saving…" : "Save changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DeleteUserDialog({
	user,
	onOpenChange,
	onDeleted,
}: {
	user: Profile | null;
	onOpenChange: (open: boolean) => void;
	onDeleted: () => void;
}) {
	const [deleting, setDeleting] = useState(false);

	const remove = async (event: MouseEvent) => {
		event.preventDefault();
		if (!user) return;

		setDeleting(true);
		try {
			await adminRequest(`/api/admin/users?id=${encodeURIComponent(user.id)}`, {
				method: "DELETE",
			});
			toast.success("User deleted");
			onDeleted();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to delete user.",
			);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<AlertDialog open={Boolean(user)} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete this user?</AlertDialogTitle>
					<AlertDialogDescription>
						This permanently deletes{" "}
						{user?.full_name || user?.email || "the user"} and their sign-in
						account. Their bookings will remain in the system.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={remove}
						disabled={deleting}
						className="bg-destructive text-white hover:bg-destructive/90"
					>
						{deleting ? "Deleting…" : "Delete user"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
