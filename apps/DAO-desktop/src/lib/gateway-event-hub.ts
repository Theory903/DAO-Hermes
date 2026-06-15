import type { RpcEvent } from "@/types/hermes";

type GatewayEventHandler = (event: RpcEvent) => void;

const handlers = new Set<GatewayEventHandler>();

export function emitGatewayEvent(event: RpcEvent): void {
  for (const handler of handlers) {
    handler(event);
  }
}

export function onGatewayEvent(handler: GatewayEventHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}
