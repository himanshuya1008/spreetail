import { useEffect, useState } from 'react';
import io, { Socket } from 'socket.io-client';

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Connect to the host origin running our custom server.ts
    const socketInstance = io({
      autoConnect: true,
      reconnection: true
    });

    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log('Socket client connected successfully');
    });

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return socket;
}
