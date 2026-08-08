import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";

export async function runGatewayModel(opts: {
  modelId: string;
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY is not set");
  }

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
  };
}
