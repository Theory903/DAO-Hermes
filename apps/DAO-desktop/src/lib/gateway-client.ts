/**
 * Space-scoped Hermes JSON-RPC gateway over WebSocket.
 *
 * Flow (matches DAO-web gateway.ts + DAO-embed.ts):
 *   POST /api/v1/spaces/{id}/ws/ticket → connect ws(s)://host/api/ws?ticket=
 *   session.create → prompt.submit (never prompt.send)
 *
 * D0: swap the relative import to `@hermes/shared` once package.json aliases exist.
 */
import {
  JsonRpcGatewayClient,
  type ConnectionState,
  type GatewayEvent,
} from "@hermes/shared";

import { createWsTicket } from "./DAO-api";
import { DAOWsBase } from "./DAO-config";

export type { ConnectionState, GatewayEvent };
export { JsonRpcGatewayClient };

export function buildGatewayWsUrl(ticket: string): string {
  return `${DAOWsBase()}/api/ws?ticket=${encodeURIComponent(ticket)}`;
}

export async function mintGatewayWsUrl(spaceId: string): Promise<string> {
  const { ticket } = await createWsTicket(spaceId);
  return buildGatewayWsUrl(ticket);
}

/** Connect a fresh JsonRpcGatewayClient for the given Space. */
export async function connectDAOGateway(spaceId: string): Promise<JsonRpcGatewayClient> {
  const wsUrl = await mintGatewayWsUrl(spaceId);
  const gateway = new JsonRpcGatewayClient({ requestIdPrefix: "cd" });
  await gateway.connect(wsUrl);
  return gateway;
}

export interface EnsureSessionOptions {
  /** Persisted source bucket (e.g. "voice") so the sidebar can group it. */
  source?: string;
  /** Title shown in the sidebar before the agent auto-titles the session. */
  title?: string;
  /** When false, the session survives disconnect and stays in chat history. */
  closeOnDisconnect?: boolean;
}

/** Session helper — uses prompt.submit per DESKTOP-APP-PLAN §6.4. */
export class DAOGatewaySession {
  private sessionId: string | null = null;
  private storedSessionId: string | null = null;

  constructor(readonly gateway: JsonRpcGatewayClient) {}

  get connectionState(): ConnectionState {
    return this.gateway.connectionState;
  }

  /** Persisted DB session key — used for sidebar routing + resume. */
  get storedId(): string | null {
    return this.storedSessionId;
  }

  onEvent(handler: (event: GatewayEvent) => void): () => void {
    return this.gateway.onEvent(handler);
  }

  onState(handler: (state: ConnectionState) => void): () => void {
    return this.gateway.onState(handler);
  }

  async ensureSession(options?: EnsureSessionOptions): Promise<string> {
    if (this.sessionId) return this.sessionId;
    const params: Record<string, unknown> = {
      close_on_disconnect: options?.closeOnDisconnect ?? true,
    };
    if (options?.source) params.source = options.source;
    if (options?.title) params.title = options.title;
    const created = await this.gateway.request<{ session_id: string; stored_session_id?: string }>(
      "session.create",
      params,
    );
    this.sessionId = created.session_id;
    this.storedSessionId = created.stored_session_id ?? null;
    return this.sessionId;
  }

  async submitPrompt(text: string, options?: EnsureSessionOptions): Promise<void> {
    const session_id = await this.ensureSession(options);
    await this.gateway.request("prompt.submit", { session_id, text });
  }

  async cancelPrompt(): Promise<void> {
    if (!this.sessionId) return;
    try {
      await this.gateway.request("prompt.cancel", { session_id: this.sessionId });
    } catch {
      /* best-effort */
    }
  }

  close(): void {
    this.gateway.close();
    this.sessionId = null;
    this.storedSessionId = null;
  }
}

let activeSession: DAOGatewaySession | null = null;

export function getActiveGatewaySession(): DAOGatewaySession | null {
  return activeSession;
}

export async function openGatewaySession(spaceId: string): Promise<DAOGatewaySession> {
  activeSession?.close();
  const gateway = await connectDAOGateway(spaceId);
  return bindGatewayClient(gateway);
}

/** Attach an already-connected JsonRpc client (e.g. HermesGateway from boot). */
export function bindGatewayClient(gateway: JsonRpcGatewayClient): DAOGatewaySession {
  activeSession?.close();
  activeSession = new DAOGatewaySession(gateway);
  return activeSession;
}

export function closeActiveGatewaySession(): void {
  activeSession?.close();
  activeSession = null;
}
