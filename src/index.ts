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


interface Move {
  id: string;
  path: [number, number][];
  options: {
    stroke: string;
    strokeWidth: number;
    fill?: string;
  };
  timestamp: number;
}

interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  image?: string;
}

interface Room {
  usersMoves: Map<string, Move[]>;
  drawed: Move[];
  users: Map<string, AuthenticatedUser>;
}

const rooms = new Map<string, Room>();
const userSocketsInRoom = new Map<string, Map<string, Set<string>>>();


const getUniqueUsersInRoom = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return new Map();

  const uniqueUsers = new Map<string, AuthenticatedUser>();
  room.users.forEach((user) => {
    uniqueUsers.set(user.id, user);
  });
  return uniqueUsers;
};

const userHasOtherTabsInRoom = (roomId: string, userId: string, currentSocketId: string): boolean => {
  const roomUserSockets = userSocketsInRoom.get(roomId);
  if (!roomUserSockets) return false;
  
  const userSockets = roomUserSockets.get(userId);
  if (!userSockets) return false;
  
  const otherSockets = new Set(userSockets);
  otherSockets.delete(currentSocketId);
  return otherSockets.size > 0;
};

const addUserSocketToRoom = (roomId: string, userId: string, socketId: string) => {
  if (!userSocketsInRoom.has(roomId)) {
    userSocketsInRoom.set(roomId, new Map());
  }
  const roomUserSockets = userSocketsInRoom.get(roomId)!;
  
  if (!roomUserSockets.has(userId)) {
    roomUserSockets.set(userId, new Set());
  }
  roomUserSockets.get(userId)!.add(socketId);
};