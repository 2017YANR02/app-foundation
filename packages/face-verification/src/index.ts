import { createHmac, randomUUID } from "node:crypto";

export type FaceVerificationResult = { status: "pending" | "passed" | "failed" };
export type FaceVerificationErrorCode = "INVALID_CONFIG" | "INVALID_INPUT" | "INVALID_RESPONSE" | "TRANSPORT" | "PERMISSION" | "BALANCE" | "PROVIDER";
type Action = "InitFaceVerify" | "DescribeFaceVerify";
export type FaceVerificationDiagnostic = { action: Action; httpStatus?: number; providerCode?: string; requestId?: string };
export class FaceVerificationError extends Error {
  constructor(public readonly code: FaceVerificationErrorCode, public readonly diagnostic?: FaceVerificationDiagnostic) {
    super(`Face verification: ${code}`);
    this.name = "FaceVerificationError";
  }
}
export type AliyunFaceConfig = { accessKeyId: string; accessKeySecret: string };
export type FaceVerificationDependencies = { fetch?: typeof fetch; now?: () => number; nonce?: () => string };
export type InitFaceVerificationInput = {
  id: string; realName: string; idCard: string; metaInfo: string; sceneId: string; returnUrl: string;
};
export type InitFaceVerificationResult = { certifyId: string; certifyUrl: string };
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/gu, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
function required(value: unknown, max: number, code: FaceVerificationErrorCode = "INVALID_INPUT"): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new FaceVerificationError(code);
}
function httpsUrl(value: unknown, code: FaceVerificationErrorCode) {
  required(value, 8192, code);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw new FaceVerificationError(code); }
}
async function readResponse(response: Response): Promise<Record<string, unknown>> {
  // The provider may return materials even when they were not requested. Bound reads and project only the public contract.
  if (!response.body) throw new FaceVerificationError("INVALID_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) { await reader.cancel(); throw new FaceVerificationError("INVALID_RESPONSE"); }
      chunks.push(value);
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!record(data)) throw new Error();
    return data;
  } catch { throw new FaceVerificationError("INVALID_RESPONSE"); }
  finally { reader.releaseLock(); }
}

/** Protocol only: consumers own account/session authorization, consent, storage, quotas and result application. */
export function createAliyunFaceClient(config: AliyunFaceConfig, dependencies: FaceVerificationDependencies = {}) {
  required(config.accessKeyId, 256, "INVALID_CONFIG");
  required(config.accessKeySecret, 256, "INVALID_CONFIG");
  const accessKeyId = config.accessKeyId;
  const secret = config.accessKeySecret;
  const request = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const nonce = dependencies.nonce ?? randomUUID;
  async function rpc(action: Action, parameters: Record<string, string>): Promise<Record<string, unknown> | null> {
    const params: Record<string, string> = {
      Action: action, Version: "2019-03-07", Format: "JSON", AccessKeyId: accessKeyId,
      SignatureMethod: "HMAC-SHA1", SignatureVersion: "1.0", SignatureNonce: nonce(),
      Timestamp: new Date(now()).toISOString().replace(/\.\d{3}Z$/u, "Z"), ...parameters,
    };
    const canonical = Object.keys(params).sort().map(key => `${encode(key)}=${encode(params[key])}`).join("&");
    const signature = createHmac("sha1", `${secret}&`).update(`POST&%2F&${encode(canonical)}`).digest("base64");
    try {
      const response = await request("https://cloudauth.cn-shanghai.aliyuncs.com/", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `${canonical}&Signature=${encode(signature)}`, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      });
      const data = await readResponse(response);
      const providerCode = typeof data.Code === "number" || typeof data.Code === "string" ? String(data.Code) : "";
      if (response.ok && action === "DescribeFaceVerify" && ["403", "424"].includes(providerCode)) return null;
      if (!response.ok || providerCode !== "200") {
        const diagnostic: FaceVerificationDiagnostic = { action, httpStatus: response.status,
          providerCode: /^\d{3}$/u.test(providerCode) ? providerCode : "unknown",
          ...typeof data.RequestId === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu.test(data.RequestId) ? { requestId: data.RequestId } : {},
        };
        throw new FaceVerificationError(providerCode === "411" ? "PERMISSION" : providerCode === "412" ? "BALANCE" : "PROVIDER", diagnostic);
      }
      if (!record(data.ResultObject)) throw new FaceVerificationError("INVALID_RESPONSE", { action });
      return data.ResultObject;
    } catch (error) {
      if (error instanceof FaceVerificationError) throw error;
      // Never attach a cause: transport exceptions can contain URLs, signed bodies or identity fields.
      throw new FaceVerificationError("TRANSPORT", { action });
    }
  }
  return {
    async init(input: InitFaceVerificationInput): Promise<InitFaceVerificationResult> {
      required(input.id, 128); required(input.realName, 60); required(input.idCard, 64);
      required(input.metaInfo, 16000); required(input.sceneId, 20);
      const returnUrl = httpsUrl(input.returnUrl, "INVALID_INPUT");
      const data = await rpc("InitFaceVerify", {
        SceneId: input.sceneId, OuterOrderNo: input.id, ProductCode: "ID_PRO", Model: "MOVE_ACTION",
        CertType: "IDENTITY_CARD", CertName: input.realName, CertNo: input.idCard, MetaInfo: input.metaInfo, ReturnUrl: returnUrl,
        VideoEvidence: "false", ProcedurePriority: "url", NeedMultiFaceCheck: "Y", RarelyCharacters: "N",
      });
      if (!data || typeof data.CertifyId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(data.CertifyId)) throw new FaceVerificationError("INVALID_RESPONSE");
      return { certifyId: data.CertifyId, certifyUrl: httpsUrl(data.CertifyUrl, "INVALID_RESPONSE") };
    },
    async query(sceneId: string, certifyId: string): Promise<FaceVerificationResult> {
      required(sceneId, 20); required(certifyId, 128);
      const data = await rpc("DescribeFaceVerify", { SceneId: sceneId, CertifyId: certifyId });
      if (data === null) return { status: "pending" };
      if (data.Passed !== "T" && data.Passed !== "F") throw new FaceVerificationError("INVALID_RESPONSE");
      return { status: data.Passed === "T" ? "passed" : "failed" };
    },
  };
}
