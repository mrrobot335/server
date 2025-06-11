const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

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

const users = {};             // { userId: socketId }
const chatHistory = {};       // { userId: [{ from, text }] }
const adminSockets = new Set();

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) {
    users[userId] = socket.id;
    console.log(`User connected: ${userId}`);
    if (!chatHistory[userId]) chatHistory[userId] = [];
  } else {
    console.log("Admin connected");
    adminSockets.add(socket.id);
  }

  socket.on("message", (data) => {
    const { sender, recipient, text } = data;

    if (!recipient || !text) return;

    // Save message for recipient
    if (!chatHistory[recipient]) chatHistory[recipient] = [];
    chatHistory[recipient].push({ from: sender, text });

    // Send message to recipient if connected
    const recipientSocketId = users[recipient];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("message", { sender, recipient, text });
    }

    // Also send message to all admins
    adminSockets.forEach(adminSocketId => {
      io.to(adminSocketId).emit("message", { sender, recipient, text });
    });
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

// ===========================
// REST API Endpoints for Admin Panel
// ===========================

app.get("/users", (req, res) => {
  res.json(Object.keys(users));
});

app.get("/chat/:userId", (req, res) => {
  const { userId } = req.params;
  res.json(chatHistory[userId] || []);
});

app.post("/chat/:userId", (req, res) => {
  const { userId } = req.params;
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: "Text is required" });

  const message = { from: "admin", text };

  if (!chatHistory[userId]) chatHistory[userId] = [];
  chatHistory[userId].push(message);

  const recipientSocketId = users[userId];
  if (recipientSocketId) {
    io.to(recipientSocketId).emit("message", { sender: "admin", recipient: userId, text });
  }

  // Also notify all admins of this message (optional, but useful)
  adminSockets.forEach(adminSocketId => {
    io.to(adminSocketId).emit("message", { sender: "admin", recipient: userId, text });
  });

  res.json({ success: true });
});

// ===========================

server.listen(3000, () => {
  console.log("Server running at http://69.62.126.138:3000");
});
