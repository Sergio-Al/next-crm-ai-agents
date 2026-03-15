import type { PluginManager } from "@crm-agent/agent-worker/src/hooks.js";

/**
 * Analytics extension — tracks conversation metrics and agent performance.
 *
 * Hooks into:
 * - agent_end: Record completion metrics (tokens, duration, tool calls)
 * - after_tool_call: Track tool usage frequency and duration
 * - session_end: Aggregate session-level statistics
 */
export function register(pluginManager: PluginManager) {
  pluginManager.on("agent_end", async (data: unknown) => {
    // TODO: Record agent run metrics to PostgreSQL or analytics service
    // - Total tokens consumed (input + output)
    // - Duration of the run
    // - Number of tool calls made
    // - Model used
    // - Finish reason
    console.log("[analytics] agent_end", data);
  });

  pluginManager.on("after_tool_call", async (data: unknown) => {
    // TODO: Track tool usage
    // - Tool name
    // - Execution duration
    // - Success/failure
    console.log("[analytics] after_tool_call", data);
  });

  pluginManager.on("session_end", async (data: unknown) => {
    // TODO: Aggregate session statistics
    // - Total messages in session
    // - Session duration
    // - User satisfaction (if available)
    console.log("[analytics] session_end", data);
  });
}
