const TOKEN_KEY = "DAO_token";
const SPACE_ID_KEY = "DAO_space_id";
const SPACE_SLUG_KEY = "DAO_space_slug";

export function getStoredToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function loadSecureToken(): Promise<string | null> {
  const desktop = window.hermesDesktop?.DAOAuth;
  if (desktop?.getToken) {
    const { token } = await desktop.getToken();
    if (token) {
      clearStoredToken();
      return token;
    }
  }
  return getStoredToken();
}

export async function persistToken(token: string): Promise<void> {
  const desktop = window.hermesDesktop?.DAOAuth;
  if (desktop?.setToken) {
    await desktop.setToken(token);
    clearStoredToken();
    return;
  }
  setStoredToken(token);
}

export async function clearSecureToken(): Promise<void> {
  const desktop = window.hermesDesktop?.DAOAuth;
  if (desktop?.clearToken) {
    await desktop.clearToken();
  }
  clearDAOSession();
}

export function getStoredSpaceId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(SPACE_ID_KEY);
}

export function setStoredSpace(spaceId: string, slug?: string): void {
  localStorage.setItem(SPACE_ID_KEY, spaceId);
  if (slug) localStorage.setItem(SPACE_SLUG_KEY, slug);
}

export function getStoredSpaceSlug(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(SPACE_SLUG_KEY);
}

export function clearStoredSpace(): void {
  localStorage.removeItem(SPACE_ID_KEY);
  localStorage.removeItem(SPACE_SLUG_KEY);
}

export function clearDAOSession(): void {
  clearStoredToken();
  clearStoredSpace();
}
