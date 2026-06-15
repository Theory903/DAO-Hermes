/**
 * DAO REST client for the desktop renderer.
 *
 * Auth: Bearer JWT from dev-login (localStorage) or httpOnly `DAO_token` cookie
 * when credentials are included.
 */
import { DAO_API_PREFIX, DAOApiBase } from "./DAO-config";
import { getAuthToken } from "./DAO-auth-token";
import { clearDAOSession } from "./DAO-storage";

export type AuthUser = {
  id: string;
  email: string;
  token: string;
};

export type Space = {
  id: string;
  name: string;
  slug: string;
  tier?: string;
  operating_mode?: string;
};

export type WsTicketResponse = {
  ticket: string;
  expires_in: number;
};

export class DAOApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DAOApiError";
  }
}

function authHeaders(init?: RequestInit): HeadersInit {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers ?? {}),
  };
}

export async function DAOFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `${DAOApiBase()}${path.startsWith("/") ? path : `${DAO_API_PREFIX}/${path}`}`;

  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: authHeaders(init),
  });

  if (res.status === 401) {
    let code: string | undefined;
    try {
      const body = (await res.clone().json()) as { error?: { code?: string } };
      code = body.error?.code;
    } catch {
      /* non-JSON */
    }
    if (code === "UNAUTHORIZED" || code === "INVALID_TOKEN") {
      clearDAOSession();
    }
    const text = await res.text().catch(() => res.statusText);
    throw new DAOApiError(text || "Unauthorized", 401, code);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new DAOApiError(text || res.statusText, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export async function devLogin(email: string, displayName?: string): Promise<AuthUser> {
  return DAOFetch<AuthUser>(`${DAO_API_PREFIX}/auth/dev-login`, {
    method: "POST",
    body: JSON.stringify({ email, display_name: displayName }),
  });
}

export type AuthProvidersResponse = {
  providers: string[];
  dev_login: boolean;
};

export async function fetchAuthProviders(): Promise<AuthProvidersResponse> {
  return DAOFetch<AuthProvidersResponse>(`${DAO_API_PREFIX}/auth/providers`);
}

export async function exchangeOAuthCode(exchangeCode: string): Promise<AuthUser> {
  return DAOFetch<AuthUser>(`${DAO_API_PREFIX}/auth/exchange`, {
    method: "POST",
    body: JSON.stringify({ exchange_code: exchangeCode }),
  });
}

export async function logoutApi(): Promise<void> {
  await DAOFetch(`${DAO_API_PREFIX}/auth/logout`, { method: "POST" });
}

export function oauthLoginUrl(provider: "google" | "github", redirectUri?: string): string {
  const params = new URLSearchParams({
    provider,
    mode: "desktop",
  });
  if (redirectUri) params.set("redirect_uri", redirectUri);
  return `${DAOApiBase()}${DAO_API_PREFIX}/auth/login?${params.toString()}`;
}

export async function fetchAuthMe(): Promise<Record<string, unknown>> {
  return DAOFetch(`${DAO_API_PREFIX}/auth/me`);
}

export type ProfilePatch = {
  display_name?: string | null;
  birthday_mm_dd?: string | null;
  clear_birthday?: boolean;
};

export async function patchAuthMe(body: ProfilePatch): Promise<Record<string, unknown>> {
  return DAOFetch(`${DAO_API_PREFIX}/auth/me`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function listSpaces(): Promise<Space[]> {
  return DAOFetch<Space[]>(`${DAO_API_PREFIX}/spaces`);
}

export async function createSpace(name: string): Promise<Space> {
  return DAOFetch<Space>(`${DAO_API_PREFIX}/spaces`, {
    method: "POST",
    body: JSON.stringify({ name, ai_lead_name: "Jarvis" }),
  });
}

export async function createWsTicket(spaceId: string): Promise<WsTicketResponse> {
  return DAOFetch<WsTicketResponse>(
    `${DAO_API_PREFIX}/spaces/${spaceId}/ws/ticket`,
    { method: "POST" },
  );
}
