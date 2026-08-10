import type { ToolContext } from "@lovable.dev/mcp-js";

export function notAuthenticated() {
  return {
    content: [{ type: "text" as const, text: "Not authenticated. Connect your Junto account first." }],
    isError: true,
  };
}

export function failure(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function ok(data: unknown, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

export function isAuthed(ctx: ToolContext) {
  return ctx.isAuthenticated() && Boolean(ctx.getUserId());
}
