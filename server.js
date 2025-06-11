const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins for testing
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static("admin"));

let messages = {}; // { userId: [{from, text}] }

io.on("connection", socket => {
  let userId = socket.handshake.query.userId;
  let isAdmin = socket.handshake.query.admin === "true";

  if (!userId && !isAdmin) {
    socket.disconnect();
    return;
  }

  if (!isAdmin) {
    console.log(`📱 User connected: ${userId}`);
    socket.join(userId);
  } else {
    console.log(`🛠 Admin connected`);
    socket.join("admins");
  }

  // Send existing messages to user
  if (userId && messages[userId]) {
    socket.emit("chatHistory", messages[userId]);
  }

  // On message
  socket.on("message", ({ to, from, text }) => {
    if (!messages[to]) messages[to] = [];
    messages[to].push({ from, text });

    // Send to recipient
    io.to(to).emit("message", { from, text });

    // Also send to admins (for updates)
    io.to("admins").emit("userUpdate", { userId: to, text });
  });
});

app.get("/users", (req, res) => {
  res.json(Object.keys(messages));
});

app.get("/chat/:userId", (req, res) => {
  res.json(messages[req.params.userId] || []);
});

app.post("/chat/:userId", (req, res) => {
  const userId = req.params.userId;
  const { text } = req.body;
  if (!messages[userId]) messages[userId] = [];
  messages[userId].push({ from: "admin", text });
  io.to(userId).emit("message", { from: "admin", text });
  res.sendStatus(200);
});

server.listen(3000, "0.0.0.0", () => {
  console.log("✅ Server listening on http://0.0.0.0:3000");
});
