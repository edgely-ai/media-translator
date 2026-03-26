const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export class OpenAIProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIProviderConfigurationError";
  }
}

function getOpenAIApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new OpenAIProviderConfigurationError(
      "OPENAI_API_KEY is required when an OpenAI provider is selected.",
    );
  }

  return apiKey;
}

export function getOpenAIBaseUrl(): string {
  return (
    process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") ??
    DEFAULT_OPENAI_BASE_URL
  );
}

export function getOpenAITextHeaders(): Headers {
  const headers = new Headers();

  headers.set("Authorization", `Bearer ${getOpenAIApiKey()}`);
  headers.set("Content-Type", "application/json");

  return headers;
}

export function getOpenAIFormHeaders(): Headers {
  const headers = new Headers();

  headers.set("Authorization", `Bearer ${getOpenAIApiKey()}`);

  return headers;
}

async function readErrorBody(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };

      if (payload.error?.message) {
        return payload.error.message;
      }
    } catch {
      return `${response.status} ${response.statusText}`;
    }
  }

  const text = await response.text();

  return text.trim() || `${response.status} ${response.statusText}`;
}

export async function assertOpenAIResponse(
  response: Response,
  operation: string,
): Promise<Response> {
  if (response.ok) {
    return response;
  }

  const message = await readErrorBody(response);
  throw new Error(`OpenAI ${operation} failed: ${message}`);
}

export function getOpenAIRequestId(response: Response): string | null {
  return response.headers.get("x-request-id");
}
