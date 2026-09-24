import { createHmac, randomUUID } from "node:crypto";

export type SmsErrorCode = "CONFIGURATION" | "INVALID_INPUT" | "TIMEOUT" | "NETWORK_ERROR" | "PROVIDER_REJECTED" | "INVALID_RESPONSE";

/** No phone, code, credentials, provider message, URL or original cause is exposed. */
export class SmsError extends Error {
  constructor(public readonly code: SmsErrorCode, public readonly providerCode?: string) {
    super(`SMS submission failed (${code})`);
    this.name = "SmsError";
  }
}

/** An accepted request is not proof of handset delivery. Neither transport retries automatically. */
export type SmsAccepted = Readonly<{ accepted: true; requestId?: string }>;
export type SmsCodeMessage = Readonly<{ phone: string; code: string; templateId?: string }>;
export interface SmsCodeSender { sendCode(message: SmsCodeMessage): Promise<SmsAccepted> }

const PHONE = /^(?:\+86)?1[3-9][0-9]{9}$/u;
const CODE = /^[0-9]{6}$/u;
const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,128}$/u;
const MAX_RESPONSE_BYTES = 16 * 1024;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonempty(value: unknown, max: number): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
}

function safeProviderCode(value: unknown): string | undefined {
  return typeof value === "string" && IDENTIFIER.test(value) ? value : undefined;
}

function validMessage(value: unknown): asserts value is SmsCodeMessage {
  if (!record(value) || Object.keys(value).some(key => !["phone", "code", "templateId"].includes(key))
    || typeof value.phone !== "string" || !PHONE.test(value.phone)
    || typeof value.code !== "string" || !CODE.test(value.code)
    || (value.templateId !== undefined && (!nonempty(value.templateId, 64) || !/^[A-Za-z0-9_]+$/u.test(value.templateId)))) {
    throw new SmsError("INVALID_INPUT");
  }
}

/** Use a trusted server clock. This is only the minimum resend interval, not a request timeout. */
export function remainingSmsRetryMs(input: Readonly<{ lastAttemptAtMs: number | null; nowMs: number; intervalMs?: number }>): number {
  if (!record(input)) throw new SmsError("INVALID_INPUT");
  const interval = input.intervalMs ?? 60_000;
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0 || !Number.isSafeInteger(interval) || interval < 1
    || (input.lastAttemptAtMs !== null && (!Number.isSafeInteger(input.lastAttemptAtMs) || input.lastAttemptAtMs < 0))) {
    throw new SmsError("INVALID_INPUT");
  }
  if (input.lastAttemptAtMs === null) return 0;
  return Math.max(0, interval - Math.max(0, input.nowMs - input.lastAttemptAtMs));
}

export type AliyunSmsConfiguration = Readonly<{
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
  timeoutMs?: number;
}>;
export type AliyunSmsDependencies = Readonly<{ fetch?: typeof fetch; now?: () => Date; nonce?: () => string }>;

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/\*/gu, "%2A").replace(/%7E/giu, "~");
}

async function readBounded(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared && (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    void response.body?.cancel().catch(() => {});
    throw new SmsError("INVALID_RESPONSE");
  }
  if (!response.body) throw new SmsError("INVALID_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new SmsError("INVALID_RESPONSE");
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size));
  } catch (error) {
    if (error instanceof SmsError) throw error;
    throw new SmsError("INVALID_RESPONSE");
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Preserves the existing Dysmsapi V2 HMAC-SHA1 RPC wire format; credentials stay with the caller. */
export function createAliyunSmsSender(configuration: AliyunSmsConfiguration, dependencies: AliyunSmsDependencies = {}): SmsCodeSender {
  if (!record(configuration) || !nonempty(configuration.accessKeyId, 256) || !nonempty(configuration.accessKeySecret, 512)
    || !nonempty(configuration.signName, 128) || !nonempty(configuration.templateCode, 64)
    || !/^[A-Za-z0-9_]+$/u.test(configuration.templateCode)) throw new SmsError("CONFIGURATION");
  const timeoutMs = configuration.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new SmsError("CONFIGURATION");
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function") throw new SmsError("CONFIGURATION");
  const now = dependencies.now ?? (() => new Date());
  const nonce = dependencies.nonce ?? randomUUID;
  return {
    async sendCode(message): Promise<SmsAccepted> {
      validMessage(message);
      if (message.templateId !== undefined) throw new SmsError("INVALID_INPUT");
      const timestamp = now();
      const nonceValue = nonce();
      if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime()) || !nonempty(nonceValue, 128)
        || !/^[A-Za-z0-9-]+$/u.test(nonceValue)) throw new SmsError("CONFIGURATION");
      const parameters: Record<string, string> = {
        AccessKeyId: configuration.accessKeyId,
        Action: "SendSms",
        Format: "JSON",
        PhoneNumbers: message.phone.replace(/^\+86/u, ""),
        RegionId: "cn-hangzhou",
        SignName: configuration.signName,
        SignatureMethod: "HMAC-SHA1",
        SignatureNonce: nonceValue,
        SignatureVersion: "1.0",
        TemplateCode: configuration.templateCode,
        TemplateParam: JSON.stringify({ code: message.code }),
        Timestamp: timestamp.toISOString().replace(/\.\d{3}Z$/u, "Z"),
        Version: "2017-05-25",
      };
      const canonical = Object.keys(parameters).sort().map(key => `${percentEncode(key)}=${percentEncode(parameters[key])}`).join("&");
      const stringToSign = `GET&${percentEncode("/")}&${percentEncode(canonical)}`;
      const signature = createHmac("sha1", `${configuration.accessKeySecret}&`).update(stringToSign).digest("base64");
      const url = `https://dysmsapi.aliyuncs.com/?Signature=${percentEncode(signature)}&${canonical}`;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new SmsError("TIMEOUT")); controller.abort(); }, timeoutMs);
      });
      const request = async (): Promise<SmsAccepted> => {
        const response = await fetcher(url, { method: "GET", redirect: "error", signal: controller.signal });
        if (controller.signal.aborted) throw new SmsError("TIMEOUT");
        const body = await readBounded(response);
        let result: unknown;
        try { result = JSON.parse(body); } catch { throw new SmsError("INVALID_RESPONSE"); }
        if (!record(result) || typeof result.Code !== "string") throw new SmsError("INVALID_RESPONSE");
        if (!response.ok || result.Code !== "OK") throw new SmsError("PROVIDER_REJECTED", safeProviderCode(result.Code));
        return { accepted: true, ...(safeProviderCode(result.RequestId) ? { requestId: result.RequestId as string } : {}) };
      };
      try { return await Promise.race([request(), timeout]); }
      catch (error) {
        if (error instanceof SmsError) throw error;
        throw new SmsError(controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR");
      } finally { clearTimeout(timer); }
    },
  };
}

export type TencentSendSmsRequest = Readonly<{
  SmsSdkAppId: string;
  SignName: string;
  TemplateId: string;
  TemplateParamSet: string[];
  PhoneNumberSet: string[];
}>;
export type TencentSmsConfiguration = Readonly<{ smsSdkAppId: string; signName: string; templateId: string }>;
export type TencentSmsDependencies = Readonly<{ send: (request: TencentSendSmsRequest) => Promise<unknown> }>;

/** SDK construction, credentials, region and request timeout remain with the application. */
export function createTencentSmsSender(configuration: TencentSmsConfiguration, dependencies: TencentSmsDependencies): SmsCodeSender {
  if (!record(configuration) || !/^[0-9]{1,32}$/u.test(configuration.smsSdkAppId)
    || !nonempty(configuration.signName, 128) || !/^[0-9]{1,32}$/u.test(configuration.templateId)
    || !record(dependencies) || typeof dependencies.send !== "function") throw new SmsError("CONFIGURATION");
  return {
    async sendCode(message): Promise<SmsAccepted> {
      validMessage(message);
      if (message.templateId !== undefined && !/^[0-9]{1,32}$/u.test(message.templateId)) throw new SmsError("INVALID_INPUT");
      const request: TencentSendSmsRequest = {
        SmsSdkAppId: configuration.smsSdkAppId,
        SignName: configuration.signName,
        TemplateId: message.templateId ?? configuration.templateId,
        TemplateParamSet: [message.code],
        PhoneNumberSet: [message.phone.startsWith("+86") ? message.phone : `+86${message.phone}`],
      };
      let response: unknown;
      try { response = await dependencies.send(request); }
      catch { throw new SmsError("NETWORK_ERROR"); }
      if (!record(response) || !Array.isArray(response.SendStatusSet) || response.SendStatusSet.length !== 1
        || !record(response.SendStatusSet[0]) || typeof response.SendStatusSet[0].Code !== "string") {
        throw new SmsError("INVALID_RESPONSE");
      }
      if (response.SendStatusSet[0].PhoneNumber !== request.PhoneNumberSet[0]) throw new SmsError("INVALID_RESPONSE");
      if (response.SendStatusSet[0].Code !== "Ok") throw new SmsError("PROVIDER_REJECTED", safeProviderCode(response.SendStatusSet[0].Code));
      return { accepted: true, ...(safeProviderCode(response.RequestId) ? { requestId: response.RequestId as string } : {}) };
    },
  };
}
