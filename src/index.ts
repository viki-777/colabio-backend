import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 } from 'uuid';

dotenv.config();

const app = express();
const server = createServer(app);

// Configure CORS for Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || ["http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(cors({
  origin: process.env.CLIENT_URL || ["http://localhost:3000", "https://your-app.vercel.app"],
  credentials: true
}));

app.get('/', (req, res) => {
  res.json({ 
    message: 'Socket.IO server is running!', 
    timestamp: new Date().toISOString(),
    connectedClients: io.engine.clientsCount
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'Healthy', 
    timestamp: new Date().toISOString(),
    connectedClients: io.engine.clientsCount
  });
});
