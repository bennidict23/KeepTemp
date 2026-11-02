export const PLATFORMS = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    origin: "https://chatgpt.com",
    url: "https://chatgpt.com/?temporary-chat=true",
    experimental: false,
  },
  {
    id: "claude",
    name: "Claude",
    origin: "https://claude.ai",
    url: "https://claude.ai/new",
    experimental: true,
  },
  {
    id: "grok",
    name: "Grok",
    origin: "https://grok.com",
    url: "https://grok.com/chat#private",
    experimental: true,
  },
  {
    id: "gemini",
    name: "Gemini",
    origin: "https://gemini.google.com",
    url: "https://gemini.google.com/app",
    experimental: true,
  },
] as const;
export type PlatformId = (typeof PLATFORMS)[number]["id"];
export function isPlatform(value: unknown): value is PlatformId {
  return PLATFORMS.some((p) => p.id === value);
}
export function platformFromUrl(value: string | URL) {
  try {
    const url = typeof value === "string" ? new URL(value) : value;
    return PLATFORMS.find((p) => p.origin === url.origin);
  } catch {
    return undefined;
  }
}
export function historyPlatformFromUrl(value: string | URL) {
  const platform = platformFromUrl(value);
  return platform?.id === "chatgpt" || platform?.id === "claude"
    ? platform
    : undefined;
}
export type HistoryPlatform = NonNullable<
  ReturnType<typeof historyPlatformFromUrl>
>;
export function platformName(id: unknown) {
  return PLATFORMS.find((p) => p.id === id)?.name ?? "助手";
}
export function captureKey(id: PlatformId) {
  return id === "chatgpt" ? "chatgpt-consent" : `capture:${id}`;
}
