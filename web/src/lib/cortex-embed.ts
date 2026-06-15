declare global {
  interface Window {
    __DAO_HERMES__?: {
      spaceId: string;
      spaceSlug?: string;
      apiPrefix: string;
      pluginsPrefix: string;
      apiBase?: string;
      wsBase: string;
      getToken: () => string | null;
      wsTicketUrl: string;
      brandTitle?: string;
    };
  }
}

/** True when the dashboard runs inside DAO OS (Next.js embed). */
export function isDAOEmbed(): boolean {
  return typeof window !== "undefined" && !!window.__DAO_HERMES__;
}

export function DAOHermes(): Window["__DAO_HERMES__"] | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__DAO_HERMES__;
}

export function DAOBrandTitle(): string {
  return window.__DAO_HERMES__?.brandTitle ?? "DAO Studio";
}

export function DAOBrandSidebar(): { line1: string; line2: string } {
  const title = DAOBrandTitle();
  const parts = title.trim().split(/\s+/);
  if (parts.length >= 2) {
    return { line1: parts[0]!, line2: parts.slice(1).join(" ") };
  }
  return { line1: title, line2: "" };
}
