import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process'; 
import dgram from 'dgram'; 
import { fileURLToPath } from 'url'; 
import { dirname, join } from 'path'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Express app
const app = express();
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
const clients = new Set(); // Set only stores unique values

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('Client connected to video stream');
    clients.add(ws);
    console.log(clients);
    console.log(`Total connected clients: ${clients.size}`);
    
    ws.on('error', console.error);
    ws.on('close', () => {
        console.log('Client disconnected from video stream');
        clients.delete(ws);
        console.log(`Remaining connected clients: ${clients.size}`);
    });
});

// Add route for drone commands
app.get('/drone/:command', (req, res) => {
    // Extract the command from the request parameters
    const command = req.params.command;
    // Send the command to the drone via UDP
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
            droneClient.send('streamon', 0, 'streamon'.length, TELLO_PORT, TELLO_IP);
        }
    });
}

// Handle drone responses
droneClient.on('message', (msg) => {
    console.log('Drone response:', msg.toString());
});

// Global variable act as a single source of truth for FFmpeg process
// This allows us to kill the old process before starting a new one multiple times before reaching the return statement
// would not have been possible if we used the return statement from startFFmpeg
let ffmpegProcess = null;

// Start FFmpeg process for video streaming
function startFFmpeg() {
    if (ffmpegProcess) {
        try {
            ffmpegProcess.kill(); //Kill old process before starting new one
        } catch (err) {
            console.error('Error killing existing FFmpeg process:', err);
        }
    }

    const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',  // Hide FFmpeg compilation info
        '-loglevel', 'error',  // Only show errors in logs

        // Input configuration
        '-i', `udp://0.0.0.0:${TELLO_VIDEO_PORT}?overrun_nonfatal=1&fifo_size=50000000`,
        // - Listen on all interfaces (0.0.0.0)
        // - Port 11111 (TELLO_VIDEO_PORT)
        // - Don't crash on buffer overrun
        // - Use 50MB buffer for network jitter

        // Video codec settings
        '-c:v', 'mpeg1video', // Use MPEG1 video codec (works well with JSMpeg)
        '-b:v', '800k', // Video bitrate: 800 kilobits/second
        '-maxrate', '800k', // Maximum bitrate allowed
        '-bufsize', '3000k', // Buffer size for rate control


        '-an', // Remove audio (drone has no audio)

        // Output format settings
        '-f', 'mpegts',  // Output format: MPEG transport stream
        '-s', '640x480', // Video size: 640x480 pixels
        '-r', '30', // Frame rate: 30 frames per second
        '-q:v', '5', // Video quality (1-31, lower is better)

        // Performance optimizations
        '-tune', 'zerolatency', // Optimize for low latency
        '-preset', 'ultrafast', // Fastest encoding speed
        '-pix_fmt', 'yuv420p', // Pixel format: YUV420 (widely compatible)
        '-flush_packets', '1', // Flush packets immediately

        'pipe:1' // Output to stdout (for streaming)
    ]);

    ffmpegProcess = ffmpeg; // A global reference to track if FFmpeg is running

    // Log FFmpeg output if it's not a repeated message
    ffmpeg.stderr.on('data', (data) => { 
        const message = data.toString();
        if (!message.includes('Last message repeated')) {
            console.log('FFmpeg:', message);
        }
    });

    let streamBuffer = Buffer.alloc(0); // Buffer to store video data
    const MPEGTS_PACKET_SIZE = 188; // MPEG-TS packet size
    const PACKETS_PER_CHUNK = 21; // Send ~4KB (21 * 188 = 3948 bytes)
    const CHUNK_SIZE = MPEGTS_PACKET_SIZE * PACKETS_PER_CHUNK;

    ffmpeg.stdout.on('data', (data) => {
        // Combine new data with existing buffer
        streamBuffer = Buffer.concat([streamBuffer, data]);
        
        // While we have enough packets to make a chunk
        while (streamBuffer.length >= CHUNK_SIZE) {
            // Take complete packets
            const chunk = streamBuffer.subarray(0, CHUNK_SIZE);
            
            // Keep remaining bytes (safer approach)
            streamBuffer = streamBuffer.subarray(Math.min(CHUNK_SIZE, streamBuffer.length));
            
            // Send to each connected client
            clients.forEach((client) => {
                // Check if client connection is OPEN (readyState 1)
                if (client.readyState === 1) {
                    try {
                        // Send 4KB chunk as binary data
                        client.send(chunk, { binary: true });
                    } catch (err) {
                        console.error('Error sending chunk:', err);
                    }
                }
            });
        }
    });

    ffmpeg.on('error', (error) => { // Listen for errors from FFmpeg process
        console.error('FFmpeg error:', error);
        setTimeout(startFFmpeg, 1000);
    });

    ffmpeg.on('exit', (code, signal) => {
        // Log whether FFmpeg exited normally (with code) or was killed (with signal)
        console.log(`FFmpeg process ${code ? 'exited with code ' + code : 'killed with signal ' + signal}`);
        ffmpegProcess = null;  // Clear the global reference
        setTimeout(startFFmpeg, 1000);  // Restart FFmpeg after 1 second
    });

    return ffmpeg; // Return the FFmpeg instance
}

// Cleanup on process exit
process.on('SIGINT', () => { // Handle Ctrl+C (SIGINT) to stop the server
    if (ffmpegProcess) { // can access ffmpegProcess because it's a global variable
        ffmpegProcess.kill();
    }
    process.exit();
});

// Serve static files
app.use(express.static(join(__dirname, 'dist')));

// Start servers
app.listen(port, () => {
    console.log(`Express server running on http://localhost:${port}`);
    console.log(`WebSocket server running on ws://localhost:${streamPort}`);
    initDrone();
    setTimeout(startFFmpeg, 2000); 
}); 