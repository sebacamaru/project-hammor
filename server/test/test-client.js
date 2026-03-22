import WebSocket from "ws";

const ws = new WebSocket("ws://127.0.0.1:3001");
let seq = 0;
let serverId = null;
let snapshotCount = 0;

function send(obj) {
  ws.send(JSON.stringify(obj));
}

function sendInput(input) {
  send({ type: "input", seq: seq++, input });
}

function log(msg) {
  console.log(`[Client] ${msg}`);
}

ws.on("open", () => {
  log("Connected");
  send({ type: "hello", name: "debug-client" });
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw);

  if (msg.type === "welcome") {
    serverId = msg.player.id;
    log(`Welcome — player ${serverId} at (${msg.player.x}, ${msg.player.y}) in ${msg.player.mapId}`);

    // Test 1: move right
    log("Test 1: Moving right...");
    sendInput({ up: false, down: false, left: false, right: true });

    setTimeout(() => {
      // Test 2: stop
      log("Test 2: Stopping...");
      sendInput({ up: false, down: false, left: false, right: false });

      setTimeout(() => ws.close(), 1000);
    }, 2000);
  }

  if (msg.type === "snapshot") {
    snapshotCount++;
    const self = msg.players.find(p => p.id === serverId);
    if (self) {
      // Log every 5th snapshot to avoid spam
      if (snapshotCount % 5 === 1) {
        log(`Snapshot #${snapshotCount} tick=${msg.tick} — pos=(${self.x.toFixed(2)}, ${self.y.toFixed(2)}) vel=(${self.vx.toFixed(2)}, ${self.vy.toFixed(2)}) facing=${self.facing} players=${msg.players.length}`);
      }
    }
  }
});

ws.on("close", () => {
  log(`Disconnected (received ${snapshotCount} snapshots)`);
});

ws.on("error", (err) => {
  console.error("[Client] Error:", err.message);
});
