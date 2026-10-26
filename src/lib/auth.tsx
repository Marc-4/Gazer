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
	const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
	const [loading, setLoading] = useState(true);
	const [profileRefreshKey, setProfileRefreshKey] = useState(0);

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
				setSessionReady(true); // <-- no setLoading(false) here anymore
			});

			const {
				data: { subscription },
			} = supabase.auth.onAuthStateChange((event, nextSession) => {
				if (!active || (event === "INITIAL_SESSION" && !nextSession)) return;
				setSession(nextSession);
				setSessionReady(true);
				if (!nextSession) {
					setProfile(null);
					setLoading(false);
					return;
				}
				if (event === "SIGNED_IN") {
					setProfileRefreshKey((key) => key + 1);
				}
			});

			return () => {
				active = false;
				subscription.unsubscribe();
			};
		}, []);

		useEffect(() => {
			if (!sessionReady) return; // <-- wait until we actually know

			const userId = session?.user.id;
			if (!userId) {
				setProfile(null);
				setLoading(false);
				return;
			}

			let active = true;
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
		}, [sessionReady, session?.user.id, profileRefreshKey, fetchProfile]);

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
