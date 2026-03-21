import WebSocket from "ws";

const ws = new WebSocket("ws://127.0.0.1:3001");
let seq = 0;

function send(obj) {
  console.log("[Client] Sending:", JSON.stringify(obj));
  ws.send(JSON.stringify(obj));
}

function sendInput(input) {
  send({ type: "input", seq: seq++, input });
}

ws.on("open", () => {
  console.log("[Client] Connected");
  send({ type: "hello", name: "debug-client" });
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw);
  console.log("[Client] Received:", msg);

  if (msg.type === "welcome") {
    // Move right for ~3 seconds
    console.log("[Client] Moving right...");
    sendInput({ up: false, down: false, left: false, right: true });

    setTimeout(() => {
      // Stop
      console.log("[Client] Stopping...");
      sendInput({ up: false, down: false, left: false, right: false });

      setTimeout(() => {
        console.log("[Client] Closing");
        ws.close();
      }, 1000);
    }, 3000);
  }
});

ws.on("close", () => {
  console.log("[Client] Disconnected");
});

ws.on("error", (err) => {
  console.error("[Client] Error:", err.message);
});
