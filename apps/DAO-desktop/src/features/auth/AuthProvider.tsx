import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  devLogin,
  fetchAuthMe,
  fetchAuthProviders,
  listSpaces,
  logoutApi,
} from "../../lib/DAO-api";
import { DAOApiBase } from "../../lib/DAO-config";
import { setRuntimeAuthToken } from "../../lib/DAO-auth-token";
import {
  clearSecureToken,
  loadSecureToken,
  persistToken,
} from "../../lib/DAO-storage";
import { closeActiveGatewaySession } from "../../lib/gateway-client";
import type { AuthContextValue, AuthPhase } from "./types";

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

type Props = { children: ReactNode };

export function AuthProvider({ children }: Props) {
  const [phase, setPhase] = useState<AuthPhase>("boot");
  const [token, setToken] = useState<string | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [spaceSlug, setSpaceSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);
  const [devLoginEnabled, setDevLoginEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const providers = await fetchAuthProviders();
        if (!cancelled) {
          setOauthProviders(providers.providers);
          setDevLoginEnabled(providers.dev_login);
        }
      } catch {
        /* offline API — keep defaults */
      }

      const stored = await loadSecureToken();
      if (cancelled) return;
      if (!stored) {
        setPhase("login");
        return;
      }

      setRuntimeAuthToken(stored);
      setToken(stored);

      try {
        await fetchAuthMe();
        if (cancelled) return;
        const { getStoredSpaceId, getStoredSpaceSlug } = await import(
          "../../lib/DAO-storage"
        );
        const storedSpace = getStoredSpaceId();
        const storedSlug = getStoredSpaceSlug();
        if (!storedSpace) {
          setPhase("spaces");
          return;
        }
        setSpaceId(storedSpace);
        setSpaceSlug(storedSlug);
        setPhase("ready");
      } catch {
        if (cancelled) return;
        await clearSecureToken();
        setRuntimeAuthToken(null);
        setPhase("login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const completeLogin = useCallback(async (userToken: string) => {
    await persistToken(userToken);
    setRuntimeAuthToken(userToken);
    setToken(userToken);
    await listSpaces();
    setPhase("spaces");
  }, []);

  const login = useCallback(
    async (email: string) => {
      setError(null);
      const user = await devLogin(email.trim());
      await completeLogin(user.token);
    },
    [completeLogin],
  );

  const loginOAuth = useCallback(
    async (provider: "google" | "github") => {
      setError(null);
      const desktop = window.hermesDesktop?.DAOAuth;
      if (desktop?.oauthLogin) {
        const result = await desktop.oauthLogin({
          apiBase: DAOApiBase(),
          provider,
        });
        await completeLogin(result.token);
        return;
      }
      throw new Error("OAuth login requires the DAO desktop app");
    },
    [completeLogin],
  );

  const selectSpace = useCallback(async (id: string, slug: string) => {
    setError(null);
    closeActiveGatewaySession();
    const { setStoredSpace } = await import("../../lib/DAO-storage");
    setStoredSpace(id, slug);
    setSpaceId(id);
    setSpaceSlug(slug);
    setPhase("ready");
  }, []);

  const logout = useCallback(() => {
    void (async () => {
      try {
        await logoutApi();
      } catch {
        /* best effort */
      }
      closeActiveGatewaySession();
      await clearSecureToken();
      setRuntimeAuthToken(null);
      setToken(null);
      setSpaceId(null);
      setSpaceSlug(null);
      setError(null);
      setPhase("login");
    })();
  }, []);

  const switchSpace = useCallback(() => {
    closeActiveGatewaySession();
    setSpaceId(null);
    setSpaceSlug(null);
    setError(null);
    setPhase("spaces");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      phase,
      token,
      spaceId,
      spaceSlug,
      error,
      oauthProviders,
      devLoginEnabled,
      login,
      loginOAuth,
      selectSpace,
      logout,
      switchSpace,
    }),
    [
      phase,
      token,
      spaceId,
      spaceSlug,
      error,
      oauthProviders,
      devLoginEnabled,
      login,
      loginOAuth,
      selectSpace,
      logout,
      switchSpace,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
