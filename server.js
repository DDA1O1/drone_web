import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process'; 
import dgram from 'dgram'; 
import { fileURLToPath } from 'url'; 
import { dirname, join } from 'path'; 
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create separate folders for different media types
const createMediaFolders = () => {
    // First creates the main uploads folder
    const uploadsDir = join(__dirname, 'uploads');
    
    // Then creates three subfolders inside uploads:
    const photosDir = join(uploadsDir, 'photos');        // for photos
    const tsDir = join(uploadsDir, 'ts_recordings');     // for .ts files
    const mp4Dir = join(uploadsDir, 'mp4_recordings');   // for .mp4 files

    // Creates all folders if they don't exist
    [uploadsDir, photosDir, tsDir, mp4Dir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    return { uploadsDir, photosDir, tsDir, mp4Dir };
};

// Initialize folders
const { uploadsDir, photosDir, tsDir, mp4Dir } = createMediaFolders();

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

// Define POST endpoint that handles photo saving
// express.json() middleware parses incoming JSON requests
app.post('/save-photo', express.json(), (req, res) => {
    const { imageData } = req.body;
    const fileName = `photo_${Date.now()}.png`;
    const filePath = join(photosDir, fileName);
    
    const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
    
    fs.writeFile(filePath, base64Data, 'base64', (err) => {
        if (err) {
            console.error('Error saving photo:', err);
            res.status(500).send('Error saving photo');
        } else {
            res.json({ fileName });
        }
    });
});

// Add route for saving video chunks
let recordingStream = null;
let mp4Process = null;

app.post('/start-recording', (req, res) => {
    const timestamp = Date.now();
    const tsFileName = `video_${timestamp}.ts`;
    const mp4FileName = `video_${timestamp}.mp4`;
    const tsFilePath = join(tsDir, tsFileName);
    const mp4FilePath = join(mp4Dir, mp4FileName);
    
    // Create TS write stream
    recordingStream = fs.createWriteStream(tsFilePath);
    
    // Start FFmpeg process for MP4 conversion
    mp4Process = spawn('ffmpeg', [
        '-i', 'pipe:0',           // Read from stdin
        '-c:v', 'copy',           // Copy video codec (no re-encoding)
        '-c:a', 'copy',           // Copy audio codec (no re-encoding)
        '-bsf:a', 'aac_adtstoasc', // Fix AAC bitstream
        '-movflags', '+faststart',  // Enable streaming
        '-y',                     // Overwrite output file
        mp4FilePath              // Output file
    ]);

    mp4Process.stderr.on('data', (data) => {
        console.log('FFmpeg MP4:', data.toString());
    });

    mp4Process.on('error', (err) => {
        console.error('FFmpeg MP4 error:', err);
    });

    res.json({ tsFileName, mp4FileName });
});

app.post('/stop-recording', (req, res) => {
    if (recordingStream || mp4Process) {
        if (recordingStream) {
            recordingStream.end();
            recordingStream = null;
        }
        if (mp4Process) {
            mp4Process.stdin.end(); // close the input stream
            mp4Process = null; // clear the reference
        }
        res.send('Recording stopped');
    } else {
        res.status(400).send('No active recording');
    }
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
        '-b:v', '1000k',     // Video bitrate: 1 Mbps (better for 640x480@30fps)
        '-maxrate', '1500k', // Allow 50% higher bitrate for peaks
        '-bufsize', '4000k', // 4x target bitrate for stable encoding

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
            
            // Save to both formats if recording
            if (recordingStream) {
                // write to .ts file directly
                recordingStream.write(chunk);
                // write to Mp4 file using ffmpeg process
                if (mp4Process && mp4Process.stdin.writable) {
                    mp4Process.stdin.write(chunk);
                }
            }
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
    if (mp4Process) {
        mp4Process.kill();
    }
    process.exit();
});

// Serve static files
app.use(express.static(join(__dirname, 'dist')));

// Start servers
app.listen(port, () => {
    console.log(`Express server running on http://localhost:${port}`);
    console.log(`WebSocket server running on ws://localhost:${streamPort}`);
    initDrone(); // Initialize drone connection with initial command and streamon
    setTimeout(startFFmpeg, 2000); // Start FFmpeg after 2 seconds
}); 