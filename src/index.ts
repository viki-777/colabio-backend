import express, { Request, Response } from 'express';
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

app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'Socket.IO server is running!', 
    timestamp: new Date().toISOString(),
    connectedClients: io.engine.clientsCount
  });
});

app.get('/health', (req: Request, res: Response) => {
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

const removeUserSocketFromRoom = (roomId: string, userId: string, socketId: string) => {
  const roomUserSockets = userSocketsInRoom.get(roomId);
  if (!roomUserSockets) return false;
  
  const userSockets = roomUserSockets.get(userId);
  if (!userSockets) return false;
  
  userSockets.delete(socketId);
  
  if (userSockets.size === 0) {
    roomUserSockets.delete(userId);
    return true;
  }
  
  if (roomUserSockets.size === 0) {
    userSocketsInRoom.delete(roomId);
  }
  
  return false;
};

const addMove = (roomId: string, socketId: string, move: Move) => {
  const room = rooms.get(roomId);
  if (!room) return;

  if (!room.users.has(socketId)) {
    room.usersMoves.set(socketId, [move]);
  }

  room.usersMoves.get(socketId)!.push(move);
};

const undoMove = (roomId: string, socketId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.usersMoves.get(socketId)!.pop();
};

io.on("connection", (socket) => {
  console.log('User connected:', socket.id);

  const getRoomId = () => {
    const joinedRoom = [...socket.rooms].find((room) => room !== socket.id);
    if (!joinedRoom) return socket.id;
    return joinedRoom;
  };

  const leaveRoom = async (roomId: string, socketId: string) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const user = room.users.get(socketId);
    if (!user) return;

    const userMoves = room.usersMoves.get(socketId);
    if (userMoves) room.drawed.push(...userMoves);
    
    room.usersMoves.delete(socketId);
    room.users.delete(socketId);

    const userCompletelyLeft = removeUserSocketFromRoom(roomId, user.id, socketId);
    
    if (userCompletelyLeft) {
      socket.broadcast.to(roomId).emit("user_disconnected", user.id);
    }

    socket.leave(roomId);
  };

  socket.on("create_room", async (user: AuthenticatedUser) => {
    let roomId: string;
    do {
      roomId = Math.random().toString(36).substring(2, 6);
    } while (rooms.has(roomId));

    socket.join(roomId);

    rooms.set(roomId, {
      usersMoves: new Map([[socket.id, []]]),
      drawed: [],
      users: new Map([[socket.id, user]]),
    });

    addUserSocketToRoom(roomId, user.id, socket.id);
    io.to(socket.id).emit("created", roomId);
  });

  socket.on("check_room", (roomId) => {
    socket.emit("room_exists", true);
  });

  socket.on("join_room", async (roomId, user: AuthenticatedUser) => {
    let room = rooms.get(roomId);

    if (!room) {
      const savedMoves: Move[] = [];
      
      room = {
        usersMoves: new Map(),
        drawed: savedMoves,
        users: new Map(),
      };
      rooms.set(roomId, room);
    }

    if (room.users.size < 12) {
      socket.join(roomId);

      const isUserAlreadyInRoom = Array.from(room.users.values()).some(u => u.id === user.id);

      room.users.set(socket.id, user);
      room.usersMoves.set(socket.id, []);

      addUserSocketToRoom(roomId, user.id, socket.id);

      io.to(socket.id).emit("joined", roomId);
    } else {
      io.to(socket.id).emit("joined", "", true);
    }
  });

  socket.on("joined_room", () => {
    const roomId = getRoomId();
    const room = rooms.get(roomId);
    if (!room) return;

    const uniqueUsers = getUniqueUsersInRoom(roomId);
    const currentUser = room.users.get(socket.id);

    io.to(socket.id).emit(
      "room",
      room,
      JSON.stringify([...room.usersMoves]),
      JSON.stringify([...uniqueUsers])
    );

    if (currentUser) {
      const isFirstTab = !userHasOtherTabsInRoom(roomId, currentUser.id, socket.id);
      if (isFirstTab) {
        socket.broadcast
          .to(roomId)
          .emit("new_user", currentUser.id, currentUser);
      }
    }
  });

  socket.on("leave_room", async () => {
    const roomId = getRoomId();
    await leaveRoom(roomId, socket.id);
  });

  socket.on("draw", async (move) => {
    const roomId = getRoomId();
    const timestamp = Date.now();

    move.id = v4();

    addMove(roomId, socket.id, { ...move, timestamp });

    io.to(socket.id).emit("your_move", { ...move, timestamp });

    socket.broadcast
      .to(roomId)
      .emit("user_draw", { ...move, timestamp }, socket.id);
  });

  socket.on("delete_stroke", (moveId) => {
    const roomId = getRoomId();
    const room = rooms.get(roomId);
    if (!room) return;

    const moveIndex = room.drawed.findIndex(move => move.id === moveId);
    if (moveIndex !== -1) {
      room.drawed.splice(moveIndex, 1);
    } else {
      room.usersMoves.forEach((moves, socketId) => {
        const userMoveIndex = moves.findIndex(move => move.id === moveId);
        if (userMoveIndex !== -1) {
          moves.splice(userMoveIndex, 1);
        }
      });
    }

    io.to(roomId).emit("stroke_deleted", moveId);
  });

  socket.on("undo", () => {
    const roomId = getRoomId();
    undoMove(roomId, socket.id);
    socket.broadcast.to(roomId).emit("user_undo", socket.id);
  });

  socket.on("mouse_move", (x, y) => {
    socket.broadcast.to(getRoomId()).emit("mouse_moved", x, y, socket.id);
  });

  socket.on("send_msg", (msg) => {
    const roomId = getRoomId();
    const room = rooms.get(roomId);
    const currentUser = room?.users.get(socket.id);
    
    if (currentUser) {
      io.to(roomId).emit("new_msg", currentUser.id, msg);
    }
  });

  socket.on("send_reaction", (reaction) => {
    const roomId = getRoomId();
    socket.broadcast.to(roomId).emit("reaction_received", reaction);
  });

  socket.on("disconnecting", async () => {
    const roomId = getRoomId();
    await leaveRoom(roomId, socket.id);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Allowed origins: ${process.env.CLIENT_URL || "localhost:3000"}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});