// server.js
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

const users = {}; // userId => socketId
const adminSockets = new Set(); // all connected admin socket IDs
let chatHistory = {}; // userId => [ { sender, recipient, text } ]
const CHAT_HISTORY_FILE = path.join(__dirname, "chatHistory.json");

// Load chat history from file
if (fs.existsSync(CHAT_HISTORY_FILE)) {
  try {
    const data = fs.readFileSync(CHAT_HISTORY_FILE, "utf-8");
    chatHistory = JSON.parse(data);
  } catch (err) {
    console.error("Error loading chat history from file:", err);
  }
}

function saveChatHistory() {
  fs.writeFile(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2), (err) => {
    if (err) console.error("Failed to save chat history:", err);
  });
}

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) {
    // User connection
    users[userId] = socket.id;
    console.log(`User connected: ${userId}`);

    if (!chatHistory[userId]) chatHistory[userId] = [];
  } else {
    // Admin connection
    adminSockets.add(socket.id);
    console.log("Admin connected");
  }

  socket.on("message", (data) => {
    const { sender, recipient, text } = data;

    if (!recipient || !text) return;

    // Store message under the userId key (whether sender or recipient)
    const key = sender === "admin" ? recipient : sender;
    if (!chatHistory[key]) chatHistory[key] = [];
    chatHistory[key].push({ sender, recipient, text });
    saveChatHistory();

    if (recipient === "admin") {
      // Send to all admins
      adminSockets.forEach(adminSocketId => {
        io.to(adminSocketId).emit("message", { sender, recipient, text });
      });
    } else {
      // Send to user
      const recipientSocketId = users[recipient];
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("message", { sender, recipient, text });
      }
    }
  });

  socket.on("disconnect", () => {
    if (userId && users[userId] === socket.id) {
      delete users[userId];
      console.log(`User disconnected: ${userId}`);
    }
    if (adminSockets.has(socket.id)) {
      adminSockets.delete(socket.id);
      console.log("Admin disconnected");
    }
  });
});

// Return list of all known userIds with message history
app.get("/users", (req, res) => {
  res.json(Object.keys(chatHistory));
});

// Get message history for a specific user
app.get("/chat/:userId", (req, res) => {
  const { userId } = req.params;
  res.json(chatHistory[userId] || []);
});

// Send a message from admin to user and save it
app.post("/chat/:userId", (req, res) => {
  const { userId } = req.params;
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: "Text is required" });

  const message = { sender: "admin", recipient: userId, text };

  if (!chatHistory[userId]) chatHistory[userId] = [];
  chatHistory[userId].push(message);
  saveChatHistory();

  const recipientSocketId = users[userId];
  if (recipientSocketId) {
    io.to(recipientSocketId).emit("message", message);
  }

  res.json({ success: true });
});

server.listen(3000, () => {
  console.log("Server running at http://69.62.126.138:3000");
});
