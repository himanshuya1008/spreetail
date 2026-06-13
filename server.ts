import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const port = process.env.PORT || 3000;

app.prepare().then(() => {
  const expressApp = express();
  const server = http.createServer(expressApp);
  
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // WebSocket namespace connection handler
  io.on('connection', (socket) => {
    console.log('Client socket connected:', socket.id);

    // Dynamic join to a group or expense chat room
    socket.on('join-room', (roomId: string) => {
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room: ${roomId}`);
    });

    // Leave a room when switching views
    socket.on('leave-room', (roomId: string) => {
      socket.leave(roomId);
      console.log(`Socket ${socket.id} left room: ${roomId}`);
    });

    // Real-time message dispatch
    socket.on('send-message', (data: { roomId: string; message: any }) => {
      // Broadcast to other subscribers in the group/expense room
      socket.to(data.roomId).emit('receive-message', data.message);
      console.log(`Message broadcasted in room ${data.roomId} by ${socket.id}`);
    });

    socket.on('disconnect', () => {
      console.log('Client socket disconnected:', socket.id);
    });
  });

  // Forward all HTTP requests to Next.js handler
  expressApp.all(/.*/, (req, res) => {
    return handle(req, res);
  });

  server.listen(port, () => {
    console.log(`> Application ready on http://localhost:${port}`);
  });
}).catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
