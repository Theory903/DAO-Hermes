/**
 * D0 integration: call from `resolveGatewayWsUrl` when a DAO Space is active.
 * Mints a fresh single-use ticket per connect attempt (DESKTOP-APP-PLAN §6.4).
 */
import { getStoredSpaceId } from "./DAO-storage";
import { mintGatewayWsUrl } from "./gateway-client";

export function isDAOSpaceMode(): boolean {
  return Boolean(getStoredSpaceId());
}

export async function resolveDAOGatewayWsUrl(): Promise<string> {
  const spaceId = getStoredSpaceId();
  if (!spaceId) {
    throw new Error("DAO Space not selected");
  }
  return mintGatewayWsUrl(spaceId);
}
