const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store active rooms
const rooms = new Map();

// Generate random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create new room
    socket.on('create-room', (username) => {
        const roomId = generateRoomId();
        rooms.set(roomId, {
            users: new Map(),
            messages: []
        });
        
        socket.join(roomId);
        rooms.get(roomId).users.set(socket.id, username);
        
        socket.emit('room-created', roomId);
        console.log(`Room created: ${roomId} by ${username}`);
    });

    // Join existing room
    socket.on('join-room', (data) => {
        const { roomId, username } = data;
        
        if (rooms.has(roomId)) {
            socket.join(roomId);
            rooms.get(roomId).users.set(socket.id, username);
            
            // Notify room about new user
            socket.to(roomId).emit('user-joined', username);
            
            // Send room info to the joining user
            const room = rooms.get(roomId);
            const userList = Array.from(room.users.values());
            const previousMessages = room.messages;
            
            socket.emit('room-joined', {
                roomId,
                users: userList,
                messages: previousMessages
            });
            
            console.log(`${username} joined room: ${roomId}`);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    // Handle messages
    socket.on('send-message', (data) => {
        const { roomId, message, username } = data;
        const room = rooms.get(roomId);
        
        if (room) {
            const messageData = {
                username,
                message,
                timestamp: new Date().toLocaleTimeString()
            };
            
            // Store message
            room.messages.push(messageData);
            
            // Broadcast to room
            io.to(roomId).emit('new-message', messageData);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Remove user from rooms
        rooms.forEach((room, roomId) => {
            if (room.users.has(socket.id)) {
                const username = room.users.get(socket.id);
                room.users.delete(socket.id);
                
                // Notify room
                socket.to(roomId).emit('user-left', username);
                
                // Clean up empty rooms
                if (room.users.size === 0) {
                    rooms.delete(roomId);
                    console.log(`Room deleted: ${roomId}`);
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});