// @n8n/chat ships a "types" field pointing at dist/index.d.ts, but that file
// isn't actually included in the published package — this fills the gap.
declare module "@n8n/chat" {
  export type ChatOptions = Record<string, unknown>;
  export function createChat(options: ChatOptions): void;
}
