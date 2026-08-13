import { generateText, type UserContent, APICallError } from "ai";
import { gateway, GatewayError } from "@ai-sdk/gateway";

const MAX_IMAGES = 6;
const MAX_DATA_URI_CHARS = 3_500_000;

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isDataImage(value: string) {
  return /^data:image\//i.test(value);
}

function pushImageRef(urls: string[], value: unknown) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  if (isHttpUrl(trimmed) || isDataImage(trimmed)) {
    urls.push(trimmed);
  }
}

export function collectImageUrls(input: Record<string, unknown>): string[] {
  const urls: string[] = [];

  for (const key of [
    "image_url",
    "fabric_image_url",
    "product_image_url",
    "cover_image_url",
  ]) {
    pushImageRef(urls, input[key]);
  }

  const listKeys = ["image_urls", "images", "fabric_images"];
  for (const key of listKeys) {
    const val = input[key];
    if (Array.isArray(val)) val.forEach((item) => pushImageRef(urls, item));
    else if (typeof val === "string") {
      if (isDataImage(val.trim())) pushImageRef(urls, val);
      else {
        val
          .split(/[\n,]/)
          .map((s) => s.trim())
          .forEach((item) => pushImageRef(urls, item));
      }
    }
  }

  return [...new Set(urls)].slice(0, MAX_IMAGES);
}

function toImagePart(ref: string): {
  type: "image";
  image: URL | string;
  mediaType?: string;
} {
  if (isDataImage(ref)) {
    if (ref.length > MAX_DATA_URI_CHARS) {
      throw new Error(
        "Image data URI is too large (max ~3.5MB). Upload to CDN/OSS and pass a public https URL.",
      );
    }
    const match = ref.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i);
    if (match) {
      return {
        type: "image",
        image: match[2].replace(/\s/g, ""),
        mediaType: match[1].toLowerCase(),
      };
    }
    return { type: "image", image: ref };
  }
  return { type: "image", image: new URL(ref) };
}

function snippet(value: string, max = 400) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function formatUpstreamError(error: unknown): string {
  const parts: string[] = [];

  if (GatewayError.isInstance(error)) {
    parts.push(`[gateway ${error.statusCode} ${error.type}] ${error.message}`);
  } else if (error instanceof Error && error.message.trim()) {
    parts.push(error.message.trim());
  } else if (typeof error === "object" && error && "message" in error) {
    const message = String((error as { message: unknown }).message || "").trim();
    if (message) parts.push(message);
  }

  if (APICallError.isInstance(error)) {
    if (error.statusCode) parts.push(`http ${error.statusCode}`);
    if (error.responseBody) parts.push(snippet(error.responseBody));
    if (error.data != null) {
      try {
        parts.push(snippet(JSON.stringify(error.data)));
      } catch {
        // ignore
      }
    }
  }

  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause: unknown }).cause
      : undefined;
  if (cause instanceof Error && cause.message.trim()) {
    parts.push(`cause: ${cause.message.trim()}`);
  }

  const unique = [...new Set(parts.filter(Boolean))];
  return (unique.join(" | ") || "Upstream model failed").slice(0, 800);
}

export async function runGatewayModel(opts: {
  modelId: string;
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  input?: Record<string, unknown>;
}) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY is not set");
  }

  const imageUrls = opts.input ? collectImageUrls(opts.input) : [];

  if (imageUrls.length === 0) {
    const result = await generateText({
      model: gateway(opts.modelId),
      system: opts.system || undefined,
      prompt: opts.prompt,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens,
    });
    return {
      text: result.text,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      totalTokens: result.usage?.totalTokens ?? 0,
      imageCount: 0,
    };
  }

  const content: UserContent = [
    { type: "text", text: opts.prompt },
    ...imageUrls.map(toImagePart),
  ];

  const result = await generateText({
    model: gateway(opts.modelId),
    system: opts.system || undefined,
    messages: [{ role: "user", content }],
    temperature: opts.temperature,
    maxOutputTokens: opts.maxTokens,
  });

  return {
    text: result.text,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    totalTokens: result.usage?.totalTokens ?? 0,
    imageCount: imageUrls.length,
  };
}
