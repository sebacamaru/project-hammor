/** Protocol message type constants. */
export const MSG_TYPES = {
  HELLO: "hello",
  WELCOME: "welcome",
  INPUT: "input",
  SNAPSHOT: "snapshot",
  ERROR: "error",
};

/**
 * Parses a raw WebSocket message into a validated message object.
 * Checks that it's valid JSON, is an object, and has a string 'type' field.
 * @param {string|Buffer} raw - Raw message data from the socket.
 * @returns {{ ok: true, message: object } | { ok: false, error: string }}
 */
export function parseMessage(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }

  if (typeof data !== "object" || data === null) {
    return { ok: false, error: "Message must be an object" };
  }

  if (typeof data.type !== "string") {
    return { ok: false, error: "Message must have a string 'type' field" };
  }

  return { ok: true, message: data };
}

/**
 * Validates the payload of an input message.
 * Ensures seq is a non-negative integer and all four directional flags are present and boolean.
 * @param {object} msg - The parsed message (must have .seq and .input).
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateInput(msg) {
  if (typeof msg.seq !== "number" || !Number.isInteger(msg.seq) || msg.seq < 0) {
    return { ok: false, error: "seq must be a non-negative integer" };
  }

  if (typeof msg.input !== "object" || msg.input === null) {
    return { ok: false, error: "input must be an object" };
  }

  const { up, down, left, right } = msg.input;
  if (
    typeof up !== "boolean" ||
    typeof down !== "boolean" ||
    typeof left !== "boolean" ||
    typeof right !== "boolean"
  ) {
    return { ok: false, error: "input flags (up/down/left/right) must all be booleans" };
  }

  return { ok: true };
}

/**
 * Creates a message object with a type and optional data fields.
 * @param {string} type - Message type (use MSG_TYPES constants).
 * @param {object} [data] - Additional fields to spread into the message.
 * @returns {object} The message object.
 */
export function createMessage(type, data = {}) {
  return { type, ...data };
}
