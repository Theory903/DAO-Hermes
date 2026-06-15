import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildDAOSidecarConnection,
  DAOSidecarBaseUrl,
  isDesktopBridgeAvailable,
} from "./DAO-sidecar-connection";

describe("DAO-sidecar-connection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects missing desktop bridge", () => {
    vi.stubGlobal("window", {});
    expect(isDesktopBridgeAvailable()).toBe(false);
  });

  it("builds remote sidecar connection descriptor", () => {
    const conn = buildDAOSidecarConnection();
    expect(conn.mode).toBe("remote");
    expect(conn.baseUrl).toMatch(/^http/);
  });

  it("defaults dev sidecar to localhost:9119", () => {
    expect(DAOSidecarBaseUrl()).toBe("http://127.0.0.1:9119");
  });
});
