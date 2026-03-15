import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelV1 } from "ai";

// Registry of provider factories, keyed by provider prefix
const providers: Record<string, (modelId: string) => LanguageModelV1> = {
  openai: (modelId) => {
    const client = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return client(modelId);
  },
  anthropic: (modelId) => {
    const client = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client(modelId);
  },
  google: (modelId) => {
    const client = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY,
    });
    return client(modelId);
  },
};

/**
 * Create an AI SDK-compatible model from a provider/model string.
 * Format: "provider/model-name" (e.g., "anthropic/claude-4-sonnet")
 */
export function createProvider(model: string): LanguageModelV1 {
  const slashIndex = model.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model format: "${model}". Expected "provider/model-name"`,
    );
  }

  const providerName = model.substring(0, slashIndex);
  const modelId = model.substring(slashIndex + 1);

  const factory = providers[providerName];
  if (!factory) {
    throw new Error(
      `Unknown provider: "${providerName}". Available: ${Object.keys(providers).join(", ")}`,
    );
  }

  return factory(modelId);
}
