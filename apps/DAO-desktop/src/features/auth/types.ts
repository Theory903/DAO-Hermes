export type AuthPhase = "boot" | "login" | "spaces" | "ready";

export type AuthContextValue = {
  phase: AuthPhase;
  token: string | null;
  spaceId: string | null;
  spaceSlug: string | null;
  error: string | null;
  oauthProviders: string[];
  devLoginEnabled: boolean;
  login: (email: string) => Promise<void>;
  loginOAuth: (provider: "google" | "github") => Promise<void>;
  selectSpace: (spaceId: string, slug: string) => Promise<void>;
  logout: () => void;
  switchSpace: () => void;
};
