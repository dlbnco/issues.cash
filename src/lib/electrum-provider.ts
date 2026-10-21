import { ElectrumNetworkProvider, type Network } from "cashscript";
import { ElectrumClient, type ElectrumClientEvents } from "@electrum-cash/network";

const MAX_ATTEMPTS = 3;
const IDLE_DISCONNECT_MS = 2_000;
const REQUEST_TIMEOUT_MS = 10_000;

export class ElectrumTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ElectrumTransportError";
  }
}

export function isElectrumTransportError(error: unknown): boolean {
  if (error instanceof ElectrumTransportError) return true;
  const message = error instanceof Error ? error.message : String(error);
  // A JSON-RPC/node rejection is not a broken connection, even when its
  // explanation mentions a timeout, network policy, or missing transaction.
  if (/daemon error|mandatory-script|non-mandatory-script|min relay fee|bad-txns/i.test(message)) return false;
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|websocket|TLS|not connected|disconnected|connection (?:closed|lost|failed)|network request failed|request timed out/i.test(message);
}

/**
 * Keep one manually managed connection per provider, serialize its requests,
 * and discard the entire client after a transport failure. CashScript 0.12's
 * automatic per-request connect/disconnect can leave a failed socket attached
 * to its client, poisoning every subsequent request (including recovery).
 */
export class RecoveringElectrumProvider extends ElectrumNetworkProvider {
  private session?: ElectrumNetworkProvider;
  private client?: ElectrumClient<ElectrumClientEvents>;
  private connected = false;
  private requestQueue: Promise<unknown> = Promise.resolve();
  private idleTimer?: ReturnType<typeof setTimeout>;

  constructor(network: Network, private readonly hostname: string) {
    super(network, { hostname });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.requestQueue.then(operation);
    // A rejected request must not reject or permanently block the next one.
    this.requestQueue = result.catch(() => undefined);
    return result;
  }

  private clearIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private scheduleDisconnect() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      void this.disconnect();
    }, IDLE_DISCONNECT_MS);
    this.idleTimer.unref?.();
  }

  private async discardSession(): Promise<boolean> {
    this.clearIdleTimer();
    const old = this.client;
    // Invalidate before closing, including when the handshake itself failed.
    this.session = undefined;
    this.client = undefined;
    this.connected = false;
    // CashScript's public disconnect() does not force-close a failed handshake.
    // The underlying client needs force=true to clear that socket and its timers.
    try { return old ? await old.disconnect(true) : false; }
    catch { return false; }
  }

  override disconnect(): Promise<boolean> {
    return this.enqueue(() => this.discardSession());
  }

  private async withDeadline<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new ElectrumTransportError("Electrum request timed out")), REQUEST_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  override performRequest(name: string, ...parameters: (string | number | boolean)[]) {
    return this.enqueue(async () => {
      this.clearIdleTimer();
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          if (!this.session) {
            this.client = new ElectrumClient("issues.cash", "1.4.1", this.hostname, { disableBrowserVisibilityHandling: true });
            this.session = new ElectrumNetworkProvider(this.network, {
              electrum: this.client, manualConnectionManagement: true,
            });
          }
          const session = this.session;
          const result = await this.withDeadline(async () => {
            if (!this.connected) {
              await session.connect();
              if (this.session !== session) throw new ElectrumTransportError("Electrum connection was replaced");
              this.connected = true;
            }
            return session.performRequest(name, ...parameters);
          });
          this.scheduleDisconnect();
          return result;
        } catch (error) {
          if (!isElectrumTransportError(error)) {
            this.scheduleDisconnect();
            throw error;
          }
          await this.discardSession();
          if (attempt === MAX_ATTEMPTS - 1) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new ElectrumTransportError(`Electrum connection failed after ${MAX_ATTEMPTS} attempts (${this.hostname}): ${reason}`);
          }
          // Broadcast retries reuse the SAME serialized hex parameter. Never
          // rebuild a transaction or retry a node's script/fee rejection here.
          await new Promise<void>((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      throw new ElectrumTransportError("Electrum connection unavailable");
    });
  }
}
