import type { WechatSignatureHeaders } from "./wechat.js";

export class WechatNotificationBodyError extends Error {
  constructor(readonly status: 400 | 408 | 413) {
    super("Invalid WeChat notification body");
  }
}

/** Keep signed bytes intact and bound both the size and stream time. */
export async function readWechatNotification(request: Request): Promise<{
  body: string;
  headers: WechatSignatureHeaders;
}> {
  const headers = {
    timestamp: request.headers.get("wechatpay-timestamp") || "",
    nonce: request.headers.get("wechatpay-nonce") || "",
    serial: request.headers.get("wechatpay-serial") || "",
    signature: request.headers.get("wechatpay-signature") || "",
  };
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 65536)) {
    throw new WechatNotificationBodyError(413);
  }
  if (
    Object.values(headers).some(value => !value || value.length > 2048)
    || !request.body
    || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") || "")
    || ![null, "identity"].includes(request.headers.get("content-encoding"))
  ) {
    throw new WechatNotificationBodyError(400);
  }
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 65536) throw new WechatNotificationBodyError(413);
        chunks.push(chunk.value);
      }
      if (!size) throw new WechatNotificationBodyError(400);
      try {
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
      } catch {
        throw new WechatNotificationBodyError(400);
      }
    };
    const body = await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new WechatNotificationBodyError(408)), 2000);
      }),
    ]);
    return { body, headers };
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
