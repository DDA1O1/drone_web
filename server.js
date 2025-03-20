import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import dgram from 'dgram';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const port = 3000;
const streamPort = 3001;

// Tello drone configuration
const TELLO_IP = '192.168.10.1';
const TELLO_PORT = 8889;
const TELLO_VIDEO_PORT = 11111;

// Create UDP client for drone commands
const droneClient = dgram.createSocket('udp4');

// Create WebSocket server for video streaming
const wss = new WebSocketServer({ port: streamPort });

// Store connected clients
const clients = new Set();

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('Client connected to video stream');
    clients.add(ws);
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
    
    ws.on('close', () => {
        console.log('Client disconnected from video stream');
        clients.delete(ws);
    });
});

// Add route for drone commands
app.get('/drone/:command', (req, res) => {
    const command = req.params.command;
    droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
        if (err) {
            console.error('Error sending command:', err);
            res.status(500).send('Error sending command');
        } else {
            res.send('Command sent');
        }
    });
});

// Initialize drone connection
function initDrone() {
    droneClient.send('command', 0, 'command'.length, TELLO_PORT, TELLO_IP, (err) => {
        if (err) console.error('Error sending command:', err);
        else {
            console.log('Drone initialized');
            // Enable video stream
            droneClient.send('streamon', 0, 'streamon'.length, TELLO_PORT, TELLO_IP);
        }
    });
}

// Handle drone responses
droneClient.on('message', (msg) => {
    console.log('Drone response:', msg.toString());
});

let ffmpegProcess = null;

// Start FFmpeg process for video streaming
function startFFmpeg() {
    if (ffmpegProcess) {
        try {
            ffmpegProcess.kill();
        } catch (err) {
            console.error('Error killing existing FFmpeg process:', err);
        }
    }

    const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel', 'error',
        '-i', `udp://0.0.0.0:${TELLO_VIDEO_PORT}?overrun_nonfatal=1&fifo_size=50000000`,
        '-c:v', 'mpeg1video',
        '-b:v', '800k',
        '-maxrate', '800k',
        '-bufsize', '3000k',
        '-an',
        '-f', 'mpegts',
        '-s', '640x480',
        '-r', '30',
        '-q:v', '5',
        '-tune', 'zerolatency',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-flush_packets', '1',
        'pipe:1'
    ]);

    ffmpegProcess = ffmpeg;

    ffmpeg.stderr.on('data', (data) => {
        const message = data.toString();
        if (!message.includes('Last message repeated')) {
            console.log('FFmpeg:', message);
        }
    });

    let streamBuffer = Buffer.alloc(0);
    const CHUNK_SIZE = 4096;

    ffmpeg.stdout.on('data', (data) => {
        streamBuffer = Buffer.concat([streamBuffer, data]);
        
        while (streamBuffer.length > CHUNK_SIZE) {
            const chunk = streamBuffer.slice(0, CHUNK_SIZE);
            streamBuffer = streamBuffer.slice(CHUNK_SIZE);
            
            clients.forEach((client) => {
                if (client.readyState === 1) {
                    try {
                        client.send(chunk, { binary: true });
                    } catch (err) {
                        console.error('Error sending chunk:', err);
                    }
                }
            });
        }
    });

    ffmpeg.on('error', (error) => {
        console.error('FFmpeg error:', error);
        // Attempt to restart FFmpeg on error
        setTimeout(startFFmpeg, 1000);
    });

    ffmpeg.on('exit', (code, signal) => {
        console.log(`FFmpeg process ${code ? 'exited with code ' + code : 'killed with signal ' + signal}`);
        ffmpegProcess = null;
        // Attempt to restart FFmpeg
        setTimeout(startFFmpeg, 1000);
    });

    return ffmpeg;
}

// Cleanup on process exit
process.on('SIGINT', () => {
    if (ffmpegProcess) {
        ffmpegProcess.kill();
    }
    process.exit();
});

// Serve static files from the dist directory
app.use(express.static(join(__dirname, 'dist')));

server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    initDrone();
    setTimeout(startFFmpeg, 2000); // Give the drone time to start streaming
}); 