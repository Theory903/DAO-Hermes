import { useEffect, useRef } from "react";

import type { HermesConnection } from "@/global";
import { HermesGateway } from "@/hermes";
import { translateNow } from "@/i18n";
import {
  buildDAOSidecarConnection,
  isDesktopBridgeAvailable,
  waitForDesktopBridge,
} from "@/lib/DAO-sidecar-connection";
import { bindGatewayClient, mintGatewayWsUrl } from "@/lib/gateway-client";
import { desktopDefaultCwd } from "@/lib/desktop-fs";
import {
  completeDesktopBoot,
  failDesktopBoot,
  setDesktopBootStep,
} from "@/store/boot";
import {
  $gateway,
  closeSecondaryGateways,
  configureGatewayRegistry,
  ensureGatewayForProfile,
  reportPrimaryGatewayState,
  setPrimaryGateway,
} from "@/store/gateway";
import { notifyError } from "@/store/notifications";
import { $activeGatewayProfile, normalizeProfileKey } from "@/store/profile";
import {
  $activeSessionId,
  $connection,
  $currentCwd,
  ensureDefaultWorkspaceCwd,
  setConnection,
  setCurrentBranch,
  setCurrentCwd,
  setSessionsLoading,
} from "@/store/session";
import type { RpcEvent } from "@/types/hermes";

interface DAOGatewayBootOptions {
  spaceId: string | null;
  handleGatewayEvent: (event: RpcEvent) => void;
  onConnectionReady: (
    connection: Awaited<ReturnType<NonNullable<typeof window.hermesDesktop>["getConnection"]>> | null,
  ) => void;
  onGatewayReady: (gateway: HermesGateway | null) => void;
  refreshHermesConfig: () => Promise<void>;
  refreshSessions: () => Promise<void>;
}

/** Space-scoped WS boot: POST ws/ticket → connect → session.create / prompt.submit. */
export function useDAOGatewayBoot({
  spaceId,
  handleGatewayEvent,
  onConnectionReady,
  onGatewayReady,
  refreshHermesConfig,
  refreshSessions,
}: DAOGatewayBootOptions) {
  const callbacksRef = useRef({
    handleGatewayEvent,
    onConnectionReady,
    onGatewayReady,
    refreshHermesConfig,
    refreshSessions,
  });

  callbacksRef.current = {
    handleGatewayEvent,
    onConnectionReady,
    onGatewayReady,
    refreshHermesConfig,
    refreshSessions,
  };

  useEffect(() => {
    if (!spaceId) return;

    let cancelled = false;

    const publish = (next: HermesConnection | null) => {
      callbacksRef.current.onConnectionReady(next);
      setConnection(next);
    };

    let bootCompleted = false;
    let reconnecting = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;

    const gateway = new HermesGateway();
    callbacksRef.current.onGatewayReady(gateway);
    const profileKey = normalizeProfileKey($activeGatewayProfile.get());
    setPrimaryGateway(gateway, profileKey);
    void ensureGatewayForProfile(profileKey);
    configureGatewayRegistry({ onEvent: (event) => callbacksRef.current.handleGatewayEvent(event) });

    const gatewayOpen = () => gateway.connectionState === "open";

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const attemptReconnect = async () => {
      if (cancelled || reconnecting || !spaceId || gatewayOpen()) return;

      reconnecting = true;
      try {
        const wsUrl = await mintGatewayWsUrl(spaceId);
        await gateway.connect(wsUrl);
        reconnectAttempt = 0;
        void ensureGatewayForProfile(profileKey);
        await callbacksRef.current.refreshHermesConfig().catch(() => undefined);
        await callbacksRef.current.refreshSessions().catch(() => undefined);
      } catch (err) {
        if (!cancelled) {
          notifyError(err, translateNow("boot.errors.gatewaySignInRequired"));
        }
      } finally {
        reconnecting = false;
        if (!cancelled && !gatewayOpen()) scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnecting || reconnectTimer !== null || gatewayOpen()) return;
      const delay = Math.min(15_000, 1_000 * 2 ** Math.min(reconnectAttempt, 4));
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void attemptReconnect();
      }, delay);
    };

    const offState = gateway.onState((st) => {
      reportPrimaryGatewayState(st);
      if (st === "open") {
        reconnectAttempt = 0;
        clearReconnectTimer();
        if (bootCompleted) completeDesktopBoot();
      } else if (bootCompleted && (st === "closed" || st === "error")) {
        scheduleReconnect();
      }
    });

    const offEvent = gateway.onEvent((event) => callbacksRef.current.handleGatewayEvent(event));

    let offWindowState: (() => void) | undefined
    void (async () => {
      const hasBridge = isDesktopBridgeAvailable() || (await waitForDesktopBridge())
      if (cancelled || !hasBridge) return
      offWindowState = window.hermesDesktop?.onWindowStateChanged?.((payload) => {
        const current = $connection.get()
        if (current) {
          publish({ ...current, ...payload })
        }
      })
    })()

    async function resolveConnection(): Promise<HermesConnection> {
      const hasBridge = isDesktopBridgeAvailable() || (await waitForDesktopBridge());
      const bridge = hasBridge ? window.hermesDesktop : undefined;

      if (bridge) {
        try {
          return await bridge.getConnection();
        } catch {
          // Sidecar mode: IPC exists but local Hermes boot failed — fall through to
          // DAO WS ticket path instead of blocking on background gateway spawn.
        }
      }

      return buildDAOSidecarConnection();
    }

    async function boot() {
      setDesktopBootStep({
        phase: "renderer.gateway.connect",
        message: translateNow("boot.steps.connectingGateway"),
        progress: 95,
      });

      try {
        const conn = await resolveConnection();
        if (cancelled) return;

        publish(conn);
        if (!spaceId) {
          failDesktopBoot("Space not selected");
          return;
        }
        const wsUrl = await mintGatewayWsUrl(spaceId);
        await gateway.connect(wsUrl);
        bindGatewayClient(gateway);
        void ensureGatewayForProfile(profileKey);

        if (cancelled) return;

        setDesktopBootStep({
          phase: "renderer.config",
          message: translateNow("boot.steps.loadingSettings"),
          progress: 97,
        });
        await ensureDefaultWorkspaceCwd();

        if (isDesktopBridgeAvailable()) {
          const remoteDefault = await desktopDefaultCwd().catch(() => null);
          if (remoteDefault?.cwd && !$activeSessionId.get() && !$currentCwd.get()) {
            setCurrentCwd(remoteDefault.cwd);
            setCurrentBranch(remoteDefault.branch || "");
          }
        }

        await callbacksRef.current.refreshHermesConfig();

        if (cancelled) return;

        setDesktopBootStep({
          phase: "renderer.sessions",
          message: translateNow("boot.steps.loadingSessions"),
          progress: 99,
        });
        await callbacksRef.current.refreshSessions();
        completeDesktopBoot();
        bootCompleted = true;
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          failDesktopBoot(message);
          notifyError(err, translateNow("boot.errors.desktopBootFailed"));
          setSessionsLoading(false);
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      offState();
      offEvent();
      offWindowState?.();
      closeSecondaryGateways();
      gateway.close();
      publish(null);
      callbacksRef.current.onGatewayReady(null);
      setPrimaryGateway(null);
      $gateway.set(null);
    };
  }, [spaceId]);
}
