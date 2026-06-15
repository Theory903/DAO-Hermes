/**
 * DAO OS REST client — space-scoped product APIs (/api/v1/spaces/...).
 * Hermes dashboard APIs continue to use lib/api.ts fetchJSON + hermes-api proxy.
 */

import { DAOHermes } from "@/lib/DAO-embed";

export type DAOSpace = {
  id: string;
  name: string;
  slug: string;
  tier: string;
  operating_mode: string;
};

export type DAOUser = {
  id: string;
  email: string;
};

function authHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token =
    DAOHermes()?.getToken() ??
    (typeof window !== "undefined"
      ? localStorage.getItem("DAO_token")
      : null);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

/** Same-origin in Next embed (rewrites to API); direct URL for standalone dev. */
export function DAOApiBase(): string {
  const fromBridge = DAOHermes()?.apiBase;
  if (fromBridge !== undefined) return fromBridge;
  return "";
}

export function getDAOSpaceId(): string | null {
  return DAOHermes()?.spaceId ?? null;
}

export function spaceApiPath(spaceId: string, path: string): string {
  return `/api/v1/spaces/${spaceId}${path}`;
}

export function DAOLoginUrl(): string {
  return "/login";
}

export function DAOLogout(): void {
  localStorage.removeItem("DAO_token");
  window.location.assign(DAOLoginUrl());
}

export async function DAOFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${DAOApiBase()}${path}`, {
    ...init,
    headers: authHeaders(init?.headers),
  });
  if (res.status === 401) {
    let body: { error?: { code?: string } } = {};
    try {
      body = await res.clone().json();
    } catch {
      /* non-JSON */
    }
    const code = body.error?.code;
    if (code === "UNAUTHORIZED" || code === "INVALID_TOKEN") {
      DAOLogout();
      return new Promise<T>(() => {});
    }
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function DAOFetchMe(): Promise<DAOUser> {
  return DAOFetch<DAOUser>("/api/v1/auth/me");
}

export async function DAOUpload(
  spaceId: string,
  path: string,
  form: FormData,
): Promise<void> {
  const headers = authHeaders();
  headers.delete("Content-Type");
  const res = await fetch(`${DAOApiBase()}${spaceApiPath(spaceId, path)}`, {
    method: "POST",
    headers,
    body: form,
  });
  if (res.status === 401) {
    let body: { error?: { code?: string } } = {};
    try {
      body = await res.clone().json();
    } catch {
      /* non-JSON */
    }
    const code = body.error?.code;
    if (code === "UNAUTHORIZED" || code === "INVALID_TOKEN") {
      DAOLogout();
      return;
    }
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  if (!res.ok) throw new Error(await res.text());
}
