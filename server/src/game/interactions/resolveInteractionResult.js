/**
 * Normalizes an authored interaction component into an event-shaped result.
 * Supports both the new `commands[]` format and the legacy `type: "text"` format.
 * Both are normalized to `{ interactionType: "event", commands: [...] }`.
 * Returns null for invalid or unsupported data.
 * @param {object|null} interaction - The interaction component from an entity.
 * @returns {{ interactionType: "event", commands: object[] } | null}
 */
export function resolveInteractionResult(interaction) {
  if (!interaction) return null;

  // New format: commands[]
  const commands = Array.isArray(interaction.commands)
    ? interaction.commands.filter(Boolean)
    : null;
  if (commands && commands.length > 0) {
    return {
      interactionType: "event",
      commands,
    };
  }

  // Legacy format: type "text"
  if (interaction.type === "text") {
    return {
      interactionType: "event",
      commands: [
        { type: "message", text: interaction.text ?? "" },
      ],
    };
  }

  return null;
}
