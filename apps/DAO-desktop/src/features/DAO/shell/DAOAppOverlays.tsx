import { useStore } from "@nanostores/react";
import { useQueryClient } from "@tanstack/react-query";

import { useGatewayRequest } from "@/app/gateway/hooks/use-gateway-request";
import { ModelPickerOverlay } from "@/app/model-picker-overlay";
import { UpdatesOverlay } from "@/app/updates-overlay";
import { BootFailureOverlay } from "@/components/boot-failure-overlay";
import { GatewayConnectingOverlay } from "@/components/gateway-connecting-overlay";
import { useModelControls } from "@/app/session/hooks/use-model-controls";
import type { HermesGateway } from "@/hermes";
import { $gateway } from "@/store/gateway";
import { $activeSessionId } from "@/store/session";

/** Footer-driven overlays shared by chat and Space company screens. */
export function DAOAppOverlays() {
  const gateway = useStore($gateway) as HermesGateway | null;
  const activeSessionId = useStore($activeSessionId);
  const queryClient = useQueryClient();
  const { requestGateway } = useGatewayRequest();
  const { selectModel } = useModelControls({ activeSessionId, queryClient, requestGateway });

  return (
    <>
      <ModelPickerOverlay gateway={gateway ?? undefined} onSelect={selectModel} />
      <UpdatesOverlay />
      <GatewayConnectingOverlay />
      <BootFailureOverlay />
    </>
  );
}
