import { lookup } from "dns/promises";
import { isIP } from "net";

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "127.0.0.1" || v === "::1" || v === "0.0.0.0") return true;
  if (v.startsWith("10.")) return true;
  if (v.startsWith("192.168.")) return true;
  if (v.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(v)) return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:")) return true;
  return false;
}

export function isUnsafeImageUrlError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /Image URL|private IP|DNS lookup failed|must be http/i.test(err.message)
  );
}

/** Block localhost / private network targets before fetching remote images. */
export async function assertSafePublicImageUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid image URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Image URL must be http(s)");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("Image URL host is not allowed");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Image URL resolves to a private IP");
    return url;
  }
  const records = await lookup(host, { all: true, verbatim: true }).catch(() => {
    throw new Error("Image URL DNS lookup failed");
  });
  if (!records.length) throw new Error("Image URL DNS lookup failed");
  for (const rec of records) {
    if (isPrivateIp(rec.address)) {
      throw new Error("Image URL resolves to a private IP");
    }
  }
  return url;
}
