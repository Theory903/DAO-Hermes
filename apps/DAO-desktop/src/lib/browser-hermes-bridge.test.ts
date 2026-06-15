import { describe, expect, it } from "vitest";

import { resolveHermesProxyUrl } from "./browser-hermes-bridge";

describe("resolveHermesProxyUrl", () => {
  const spaceId = "640d2e05-57c6-47ff-984d-6012fe1bda0c";

  it("maps Hermes REST paths through the DAO hermes-api proxy", () => {
    expect(resolveHermesProxyUrl(spaceId, "/api/sessions")).toBe(
      `/api/v1/spaces/${spaceId}/hermes-api/sessions`,
    );
    expect(resolveHermesProxyUrl(spaceId, "/api/sessions?limit=40&offset=0")).toBe(
      `/api/v1/spaces/${spaceId}/hermes-api/sessions?limit=40&offset=0`,
    );
    expect(resolveHermesProxyUrl(spaceId, "/api/profiles/active")).toBe(
      `/api/v1/spaces/${spaceId}/hermes-api/profiles/active`,
    );
  });
});
