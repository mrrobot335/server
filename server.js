const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const users = {};        // userId => socketId
const adminSockets = new Set(); // all connected admin socket IDs

// Persistent chat history file
const DB_FILE = path.join(__dirname, "messages.json");

let chatHistory = {};

// Load previous messages
if (fs.existsSync(DB_FILE)) {
  try {
    chatHistory = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    console.log("✅ Loaded message history.");
  } catch (err) {
    console.error("❌ Failed to load message history:", err);
  }
}

// Save to disk helper
function saveHistory() {
  fs.writeFileSync(DB_FILE, JSON.stringify(chatHistory, null, 2));
}

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId && userId !== "admin") {
    // Client user connection
    users[userId] = socket.id;
    console.log(`👤 User connected: ${userId}`);
    if (!chatHistory[userId]) chatHistory[userId] = [];
  } else {
    // Admin connection
    adminSockets.add(socket.id);
    console.log("🛠️ Admin connected");

    // Admin requests full chat history
    socket.on("getHistory", () => {
      socket.emit("history", chatHistory);
    });
  }

  socket.on("message", (data) => {
    const { sender, recipient, text } = data;
    if (!recipient || !text) return;

    const target = sender === "admin" ? recipient : sender;
    if (!chatHistory[target]) chatHistory[target] = [];
    chatHistory[target].push({ sender, recipient, text });
    saveHistory();

    // Emit to all admins
    if (recipient === "admin") {
      adminSockets.forEach(adminSocketId => {
        io.to(adminSocketId).emit("message", { sender, recipient, text });
      });
    } else {
      const recipientSocketId = users[recipient];
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("message", { sender, recipient, text });
      }

      // Also notify all admins of user message
      adminSockets.forEach(adminSocketId => {
        io.to(adminSocketId).emit("message", { sender, recipient, text });
      });
    }
  });

  socket.on("disconnect", () => {
    if (userId && users[userId] === socket.id) {
      delete users[userId];
      console.log(`❌ User disconnected: ${userId}`);
    }
    if (adminSockets.has(socket.id)) {
      adminSockets.delete(socket.id);
      console.log("❌ Admin disconnected");
    }
  });
});

// REST API for admin panel
app.get("/users", (req, res) => {
  res.json(Object.keys(chatHistory));
});

app.get("/chat/:userId", (req, res) => {
  const { userId } = req.params;
  res.json(chatHistory[userId] || []);
});

app.post("/chat/:userId", (req, res) => {
  const { userId } = req.params;
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: "Text is required" });

  const message = { sender: "admin", recipient: userId, text };

  if (!chatHistory[userId]) chatHistory[userId] = [];
  chatHistory[userId].push(message);
  saveHistory();

  const recipientSocketId = users[userId];
  if (recipientSocketId) {
    io.to(recipientSocketId).emit("message", message);
  }

  res.json({ success: true });
});

server.listen(3000, () => {
  console.log("🚀 Server running at http://69.62.126.138:3000");
});
