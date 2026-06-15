import { useStore } from "@nanostores/react";
import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useGatewayRequest } from "@/app/gateway/hooks/use-gateway-request";
import { useStatusSnapshot } from "@/app/shell/hooks/use-status-snapshot";
import { useStatusbarItems } from "@/app/shell/hooks/use-statusbar-items";
import {
  AGENTS_ROUTE,
  appViewForPath,
  COMMAND_CENTER_ROUTE,
  CRON_ROUTE,
  isOverlayView,
} from "@/app/routes";
import { isDAOSpaceRoute } from "@/features/DAO/routes";
import type { CommandCenterSection } from "@/app/command-center";
import { $gatewayState } from "@/store/session";
import { setModelPickerOpen } from "@/store/session";

/** Full Hermes status footer for DAO company screens. */
export function useCompanyStatusbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const gatewayState = useStore($gatewayState);
  const { requestGateway } = useGatewayRequest();
  const { gatewayLogLines, inferenceStatus, statusSnapshot } = useStatusSnapshot(
    gatewayState,
    requestGateway,
  );

  const onSpaceRoute = isDAOSpaceRoute(location.pathname);
  const currentView = appViewForPath(location.pathname);
  const overlayOpen = isOverlayView(currentView);
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  const openOverlay = useCallback(
    (path: string) => {
      if (overlayOpen) {
        navigate(path);
        return;
      }
      navigate(path, { state: { returnTo } });
    },
    [navigate, overlayOpen, returnTo],
  );

  const closeOverlay = useCallback(() => {
    const state = location.state as { returnTo?: string } | null;
    navigate(state?.returnTo || returnTo || "/", { replace: true });
  }, [location.state, navigate, returnTo]);

  const commandCenterOpen = currentView === "command-center";
  const agentsOpen = currentView === "agents";
  const chatOpen = !onSpaceRoute && currentView === "chat";

  const toggleCommandCenter = useCallback(() => {
    if (commandCenterOpen) {
      closeOverlay();
    } else {
      openOverlay(COMMAND_CENTER_ROUTE);
    }
  }, [closeOverlay, commandCenterOpen, openOverlay]);

  const openAgents = useCallback(() => openOverlay(AGENTS_ROUTE), [openOverlay]);

  const openCommandCenterSection = useCallback(
    (section: CommandCenterSection) => openOverlay(`${COMMAND_CENTER_ROUTE}?section=${section}`),
    [openOverlay],
  );

  const { leftStatusbarItems, statusbarItems } = useStatusbarItems({
    agentsOpen,
    chatOpen,
    commandCenterOpen,
    extraLeftItems: [],
    extraRightItems: [],
    gatewayLogLines,
    gatewayState,
    inferenceStatus,
    modelMenuContent: undefined,
    openAgents,
    openCommandCenterSection,
    freshDraftReady: false,
    requestGateway,
    statusSnapshot,
    toggleCommandCenter,
  });

  const leftItems = useMemo(
    () =>
      leftStatusbarItems.map((item) =>
        item.id === "cron"
          ? {
              ...item,
              to: undefined,
              onSelect: () => openOverlay(CRON_ROUTE),
            }
          : item,
      ),
    [leftStatusbarItems, openOverlay],
  );

  const rightItems = useMemo(
    () =>
      statusbarItems.map((item) =>
        item.id === "model-summary" && item.variant === "action"
          ? {
              ...item,
              onSelect: () => setModelPickerOpen(true),
            }
          : item,
      ),
    [statusbarItems],
  );

  return { leftStatusbarItems: leftItems, statusbarItems: rightItems };
}
