let runtimeAuthToken: string | null = null;

export function setRuntimeAuthToken(token: string | null): void {
  runtimeAuthToken = token;
}

export function getAuthToken(): string | null {
  return runtimeAuthToken ?? getStoredTokenFallback();
}

function getStoredTokenFallback(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem("DAO_token");
}
