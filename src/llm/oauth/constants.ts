export const OAUTH = {
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  authorizeUrl: "https://claude.ai/oauth/authorize",
  tokenUrl: "https://console.anthropic.com/v1/oauth/token",
  redirectUri: "https://console.anthropic.com/oauth/code/callback",
  scopes: "org:create_api_key user:profile user:inference",
  betaHeader: "claude-code-20250219,oauth-2025-04-20",
  userAgent: "claude-cli/1.0",
  xApp: "cli",
  anthropicVersion: "2023-06-01",
  model: "claude-sonnet-4-6",
  claudeCodeSystem: "You are Claude Code, Anthropic's official CLI for Claude.",
  messagesUrl: "https://api.anthropic.com/v1/messages",
} as const;
