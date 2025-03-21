import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import bodyparser from 'body-parser';
import authroutes from './routes/auth.js';
import cookieRoutes from './routes/cookie.js';
import uploadRoutes from './routes/upload.js';
import { initializeSocket } from './socket.js';
import cors from 'cors';
import cookie from 'cookie-parser';

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
	cors: {
		origin: 'http://localhost',
		method: ['GET', 'POST', 'PUT', 'DELETE'],
		credentials: true,
	},
});

// Initialize Socket.IO from socket.js
initializeSocket(io);

const PORT = process.env.PORT;

app.use(
	cors({
		origin: 'http://localhost',
		method: ['GET', 'POST', 'PUT', 'DELETE'],
		credentials: true,
	})
);

app.use(bodyparser.json());
app.use(cookie());
app.use('/uploads', express.static('./uploads'));

//Middlewar to prevent caching when the user logged out
app.use((req, res, next) => {
	res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
	res.set('Pragma', 'no-cache'); // For compatibility with old browsers
	res.set('Expires', '0'); // Prevent future caching
	next();
});

//Routes
app.use('/auth', authroutes);
app.use('/cookie', cookieRoutes);
app.use('/api', uploadRoutes);

server.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
