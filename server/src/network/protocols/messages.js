export const MSG_TYPES = {
  HELLO: "hello",
  WELCOME: "welcome",
  INPUT: "input",
  ERROR: "error",
};

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

export function createMessage(type, data = {}) {
  return { type, ...data };
}
