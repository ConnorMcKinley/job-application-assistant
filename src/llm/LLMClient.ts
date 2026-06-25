export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMCompleteOptions {
  system?: string;
  maxTokens?: number;
  images?: string[];
}

export interface LLMClient {
  complete(messages: LLMMessage[], opts?: LLMCompleteOptions): Promise<string>;
}
