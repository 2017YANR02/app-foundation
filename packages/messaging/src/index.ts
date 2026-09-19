export type MailErrorCode = "CONFIGURATION" | "INVALID_INPUT" | "TIMEOUT" | "NETWORK_ERROR" | "PROVIDER_REJECTED" | "INVALID_RESPONSE";

/** No recipient, body, credential, raw provider error or nested cause is attached. */
export class MailError extends Error {
  constructor(public readonly code: MailErrorCode, public readonly status?: number) {
    super(`Email transport failed (${code})`);
    this.name = "MailError";
  }
}

export type ResendConfiguration = Readonly<{ apiKey: string; from: string; timeoutMs?: number }>;
export type EmailMessage = Readonly<{
  to: string | readonly string[];
  subject: string;
  text: string;
  html?: string;
  headers?: Readonly<Record<string, string>>;
  /** Reuse only for the exact same logical message and payload. No automatic retries. */
  idempotencyKey?: string;
}>;
export type EmailAccepted = Readonly<{ accepted: true; messageId: string }>;
export type MailDependencies = Readonly<{ fetch?: typeof fetch }>;

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024;
const BLOCKED_MAIL_HEADERS = new Set(["from", "to", "cc", "bcc", "subject", "sender", "reply-to", "return-path", "content-type", "content-transfer-encoding", "mime-version"]);
const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const singleLine = (v: unknown, maximum: number): v is string => typeof v === "string" && Boolean(v.trim()) && v.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(v);

function bodyFor(config: ResendConfiguration, message: EmailMessage) {
  if (!isRecord(message) || Object.keys(message).some(key => !["to", "subject", "text", "html", "headers", "idempotencyKey"].includes(key))) {
    throw new MailError("INVALID_INPUT");
  }
  const to = typeof message.to === "string" ? [message.to] : message.to;
  if (!Array.isArray(to) || to.length < 1 || to.length > 100
    || !to.every(value => singleLine(value, 320) && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/u.test(value))
    || !singleLine(message.subject, 998)
    || typeof message.text !== "string" || !message.text.trim()
    || (message.html !== undefined && typeof message.html !== "string")) throw new MailError("INVALID_INPUT");
  if (message.idempotencyKey !== undefined && (!singleLine(message.idempotencyKey, 256)
    || !/^[A-Za-z0-9._:/-]+$/u.test(message.idempotencyKey))) throw new MailError("INVALID_INPUT");
  if (message.headers !== undefined) {
    if (!isRecord(message.headers) || Object.keys(message.headers).length > 32) throw new MailError("INVALID_INPUT");
    for (const [key, value] of Object.entries(message.headers)) {
      if (!/^[A-Za-z0-9-]{1,78}$/u.test(key) || BLOCKED_MAIL_HEADERS.has(key.toLowerCase())
        || !singleLine(value, 2048)) throw new MailError("INVALID_INPUT");
    }
  }
  const body = JSON.stringify({ from: config.from, to: [...to], subject: message.subject, text: message.text,
    ...(message.html === undefined ? {} : { html: message.html }), ...(message.headers ? { headers: { ...message.headers } } : {}) });
  if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) throw new MailError("INVALID_INPUT");
  return body;
}

async function readAccepted(response: Response, signal: AbortSignal): Promise<EmailAccepted> {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    void response.body?.cancel().catch(() => {});
    throw new MailError("INVALID_RESPONSE");
  }
  if (!response.body) throw new MailError("INVALID_RESPONSE");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new MailError("INVALID_RESPONSE");
      chunks.push(value);
    }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size))); }
    catch { throw new MailError("INVALID_RESPONSE"); }
    if (!isRecord(value) || typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(value.id)) throw new MailError("INVALID_RESPONSE");
    return { accepted: true, messageId: value.id };
  } finally {
    signal.removeEventListener("abort", cancel);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** A provider acceptance is not inbox delivery. Configuration and templates remain consumer-owned. */
export function createResendClient(configuration: ResendConfiguration, dependencies: MailDependencies = {}) {
  if (!isRecord(configuration) || !singleLine(configuration.apiKey, 512) || /\s/u.test(configuration.apiKey)
    || !singleLine(configuration.from, 320)) throw new MailError("CONFIGURATION");
  const config = { apiKey: configuration.apiKey, from: configuration.from, timeoutMs: configuration.timeoutMs ?? 10_000 };
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 60_000) throw new MailError("CONFIGURATION");
  const fetcher = dependencies.fetch ?? fetch;
  return {
    async send(message: EmailMessage): Promise<EmailAccepted> {
      // Snapshot the exact payload before any I/O; callers cannot mutate it in flight.
      const body = bodyFor(config, message);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let responseBody: ReadableStream<Uint8Array> | null | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new MailError("TIMEOUT"));
          controller.abort();
          if (responseBody && !responseBody.locked) void responseBody.cancel().catch(() => {});
        }, config.timeoutMs);
      });
      const request = async () => {
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST", redirect: "error", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json",
            ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}) },
          body, signal: controller.signal,
        });
        responseBody = response.body;
        if (controller.signal.aborted) { void responseBody?.cancel().catch(() => {}); throw new MailError("TIMEOUT"); }
        if (response.status < 200 || response.status >= 300) {
          void response.body?.cancel().catch(() => {});
          throw new MailError("PROVIDER_REJECTED", response.status);
        }
        return readAccepted(response, controller.signal);
      };
      try { return await Promise.race([request(), timeout]); }
      catch (error) {
        if (error instanceof MailError) throw error;
        throw new MailError(controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR");
      } finally { clearTimeout(timer); }
    },
  };
}
