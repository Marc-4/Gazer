import type { Session, User } from "@supabase/supabase-js";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { supabase } from "./supabase";
import type { Profile } from "./types";

interface AuthContextValue {
	session: Session | null;
	user: User | null;
	profile: Profile | null;
	loading: boolean;
	isAdmin: boolean;
	refreshProfile: () => Promise<void>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [session, setSession] = useState<Session | null>(null);
	const [profile, setProfile] = useState<Profile | null>(null);
	const [loading, setLoading] = useState(true);

	const fetchProfile = useCallback(async (userId: string) => {
		const { data, error } = await supabase
			.from("profiles")
			.select("*")
			.eq("id", userId)
			.maybeSingle();

		if (error) {
			console.error("Unable to load profile", error);
			return null;
		}

		return data as Profile | null;
	}, []);

	useEffect(() => {
		let active = true;

		supabase.auth.getSession().then(({ data }) => {
			if (!active) return;
			setSession(data.session);
			if (!data.session) {
				setLoading(false);
			}
		});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, nextSession) => {
			if (!active) return;
			setSession(nextSession);
			if (!nextSession) {
				setProfile(null);
				setLoading(false);
			}
		});

		return () => {
			active = false;
			subscription.unsubscribe();
		};
	}, []);

	useEffect(() => {
		const userId = session?.user.id;
		if (!userId) {
			setProfile(null);
			setLoading(false);
			return;
		}

		let active = true;
		setLoading(true);

		fetchProfile(userId)
			.then((nextProfile) => {
				if (active) setProfile(nextProfile);
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [session?.user.id, fetchProfile]);

	const refreshProfile = useCallback(async () => {
		const userId = session?.user.id;
		if (!userId) {
			setProfile(null);
			return;
		}
		const nextProfile = await fetchProfile(userId);
		setProfile(nextProfile);
	}, [session?.user.id, fetchProfile]);

	const signOut = useCallback(async () => {
		await supabase.auth.signOut();
		setProfile(null);
		setSession(null);
	}, []);

	const value = useMemo<AuthContextValue>(
		() => ({
			session,
			user: session?.user ?? null,
			profile,
			loading,
			isAdmin: profile?.role === "admin" && profile.is_active,
			refreshProfile,
			signOut,
		}),
		[session, profile, loading, refreshProfile, signOut],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used inside an AuthProvider");
	}
	return context;
}
