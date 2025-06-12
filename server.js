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

const users = {}; // userId => socketId
const adminSockets = new Set(); // Set of admin socket IDs
const chatHistory = {}; // userId => [ { sender, recipient, text } ]

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

  // Message handler
  socket.on("message", (data) => {
    const { sender, recipient, text } = data;
    if (!recipient || !text) return;

    const userKey = sender === "admin" ? recipient : sender;

    if (!chatHistory[userKey]) chatHistory[userKey] = [];
    chatHistory[userKey].push({ sender, recipient, text });

    // Send message to recipient
    if (recipient === "admin") {
      // Broadcast to all admins
      adminSockets.forEach((adminSocketId) => {
        io.to(adminSocketId).emit("message", { sender, recipient, text });
      });
    } else {
      // Send to recipient user
      const recipientSocketId = users[recipient];
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("message", { sender, recipient, text });
      }

      // Also notify all admins of this message
      adminSockets.forEach((adminSocketId) => {
        io.to(adminSocketId).emit("message", { sender, recipient, text });
      });
    }
  });

  // Disconnect handling
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

// REST API — get all user IDs with active chat history
app.get("/users", (req, res) => {
  res.json(Object.keys(chatHistory));
});

// Get full chat history with a specific user
app.get("/chat/:userId", (req, res) => {
  const { userId } = req.params;
  res.json(chatHistory[userId] || []);
});

// Admin sends a message to a user via HTTP
app.post("/chat/:userId", (req, res) => {
  const { userId } = req.params;
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: "Text is required" });

  const message = { sender: "admin", recipient: userId, text };

  if (!chatHistory[userId]) chatHistory[userId] = [];
  chatHistory[userId].push(message);

  const recipientSocketId = users[userId];
  if (recipientSocketId) {
    io.to(recipientSocketId).emit("message", message);
  }

  // Also notify all admins
  adminSockets.forEach((adminSocketId) => {
    io.to(adminSocketId).emit("message", message);
  });

  res.json({ success: true });
});

server.listen(3000, () => {
  console.log("✅ Server running at http://69.62.126.138:3000");
});
