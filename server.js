const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let users = {}; // { userId: ws }
let messages = {}; // { userId: [ { from: "user"/"admin", text: "..." } ] }

// Serve admin panel files (optional if using static HTML)
app.use(express.static("admin"));

// Get all connected users
app.get("/users", (req, res) => {
  res.json(Object.keys(users));
});

// Get messages with specific user
app.get("/chat/:userId", (req, res) => {
  const userId = req.params.userId;
  res.json(messages[userId] || []);
});

// Send message from admin to user
app.post("/chat/:userId", (req, res) => {
  const userId = req.params.userId;
  const text = req.body.text;

  if (users[userId] && users[userId].readyState === WebSocket.OPEN) {
    users[userId].send(JSON.stringify({ from: "admin", text }));
    messages[userId] = messages[userId] || [];
    messages[userId].push({ from: "admin", text });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "User not connected" });
  }
});

wss.on("connection", (ws) => {
  let userId;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === "init") {
        userId = data.userId;
        users[userId] = ws;
        messages[userId] = messages[userId] || [];
      } else if (data.type === "message") {
        messages[userId] = messages[userId] || [];
        messages[userId].push({ from: "user", text: data.text });

        // You can broadcast or store more logic here
      }
    } catch (e) {
      console.error("Invalid message:", msg);
    }
  });

  ws.on("close", () => {
    if (userId && users[userId] === ws) {
      delete users[userId];
    }
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log("✅ Server listening on http://0.0.0.0:3000");
});
