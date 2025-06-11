const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;

// In-memory storage for demo
// Structure: { username: [{sender, text, timestamp}] }
const chats = {};
// Store connected WebSocket clients for real-time pushing
const clients = new Map(); // username => ws

// REST API: get all users
app.get('/users', (req, res) => {
  res.json(Object.keys(chats));
});

// REST API: get chat with a user
app.get('/chat/:username', (req, res) => {
  const username = req.params.username;
  res.json(chats[username] || []);
});

// REST API: send message from agent to user
app.post('/chat/:username', (req, res) => {
  const username = req.params.username;
  const { text } = req.body;
  if (!text || !username) return res.status(400).json({ error: "Invalid input" });

  const msg = { sender: 'Support', text, timestamp: Date.now() };
  if (!chats[username]) chats[username] = [];
  chats[username].push(msg);

  // Send message to user if connected via websocket
  if (clients.has(username)) {
    clients.get(username).send(JSON.stringify(msg));
  }

  res.json({ success: true });
});

// WebSocket server to communicate with extension users
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws, req) => {
  let userName = null;

  ws.on('message', (message) => {
    // Expect JSON: { type: "register", username: "user1" } or { type: "message", text: "hi" }
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === 'register' && data.username) {
      userName = data.username;
      clients.set(userName, ws);
      if (!chats[userName]) chats[userName] = [];
      console.log(`User connected: ${userName}`);
    } else if (data.type === 'message' && userName) {
      // User sent a message
      const msg = { sender: userName, text: data.text, timestamp: Date.now() };
      chats[userName].push(msg);

      // Here you can add logic to notify agent page in real-time (if implemented)
      console.log(`Message from ${userName}: ${data.text}`);
    }
  });

  ws.on('close', () => {
    if (userName) {
      clients.delete(userName);
      console.log(`User disconnected: ${userName}`);
    }
  });
});

app.listen(PORT, () => {
  console.log(`REST API running on http://localhost:${PORT}`);
});
