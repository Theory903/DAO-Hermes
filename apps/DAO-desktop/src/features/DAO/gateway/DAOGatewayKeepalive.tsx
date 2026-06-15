import { useCallback, useRef } from "react";

import { useDAOGatewayBoot } from "@/app/gateway/hooks/use-DAO-gateway-boot";
import type { HermesGateway } from "@/hermes";
import { useAuth } from "@/features/auth";
import { emitGatewayEvent } from "@/lib/gateway-event-hub";
import type { RpcEvent } from "@/types/hermes";

/** Keeps the Space-scoped Hermes gateway connected on company routes (not only chat). */
export function DAOGatewayKeepalive() {
  const { phase, spaceId } = useAuth();
  const gatewayRef = useRef<HermesGateway | null>(null);

  const handleGatewayEvent = useCallback((event: RpcEvent) => {
    emitGatewayEvent(event);
  }, []);

  const refreshHermesConfig = useCallback(async () => {
    const gateway = gatewayRef.current;
    if (!gateway) return;
    try {
      await gateway.request("config.get", {});
    } catch {
      /* offline */
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    const gateway = gatewayRef.current;
    if (!gateway) return;
    try {
      await gateway.request("session.list", { limit: 1, offset: 0 });
    } catch {
      /* offline */
    }
  }, []);

  useDAOGatewayBoot({
    spaceId: phase === "ready" ? spaceId : null,
    handleGatewayEvent,
    onConnectionReady: () => undefined,
    onGatewayReady: (gateway) => {
      gatewayRef.current = gateway;
    },
    refreshHermesConfig,
    refreshSessions,
  });

  return null;
}
