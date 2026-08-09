import { generateText, type UserContent } from "ai";
import { gateway } from "@ai-sdk/gateway";

function collectImageUrls(input: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) {
      urls.push(v.trim());
    }
  };

  for (const key of [
    "image_url",
    "fabric_image_url",
    "product_image_url",
    "cover_image_url",
  ]) {
    push(input[key]);
  }

  const listKeys = ["image_urls", "images", "fabric_images"];
  for (const key of listKeys) {
    const val = input[key];
    if (Array.isArray(val)) val.forEach(push);
    else if (typeof val === "string") {
      val
        .split(/[\n,]/)
        .map((s) => s.trim())
        .forEach(push);
    }
  }

  return [...new Set(urls)].slice(0, 6);
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
    ...imageUrls.map((url) => ({
      type: "image" as const,
      image: new URL(url),
    })),
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

export { collectImageUrls };
