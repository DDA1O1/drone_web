import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process'; 
import dgram from 'dgram'; 
import { fileURLToPath } from 'url'; 
import { dirname, join } from 'path'; 
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Add this near the top of the file, with other state variables
let monitoringInterval = null;

// Simple error handling function
function handleError(error, res = null) {
    // Always log the error
    console.error(error.message || error);
    
    // If we have a response object, send error to client
    if (res) {
        // Use 400 for client errors (like invalid commands)
        // Use 500 for server errors (like process failures)
        const status = error.clientError ? 400 : 500;
        res.status(status).send(error.message || 'Internal server error');
    }
    return false;
}

// Create separate folders for different media types
const createMediaFolders = () => {
    try {
        // First creates the main uploads folder
        const uploadsDir = join(__dirname, 'uploads');
        
        // Then creates two subfolders inside uploads:
        const photosDir = join(uploadsDir, 'photos');        // for photos
        const mp4Dir = join(uploadsDir, 'mp4_recordings');   // for .mp4 files

        // Creates all folders if they don't exist
        [uploadsDir, photosDir, mp4Dir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true, mode: 0o755 }); // Add mode for proper permissions
            }
        });

        // Test write permissions by trying to write and remove a test file
        const testFile = join(photosDir, '.test');
        fs.writeFileSync(testFile, '');
        fs.unlinkSync(testFile);

        return { uploadsDir, photosDir, mp4Dir };
    } catch (error) {
        console.error('Error creating media folders:', error);
        throw error;
    }
};

// Initialize folders with error handling
let photosDir, mp4Dir;
try {
    ({ photosDir, mp4Dir } = createMediaFolders());
} catch (error) {
    console.error('Failed to create or verify media folders:', error);
    process.exit(1);
}

// Initialize Express app
const app = express();
const port = 3000;
const streamPort = 3001;

// Configure middleware for parsing JSON and form data
app.use(express.json());  // Default ~100kb limit is sufficient
app.use(express.urlencoded({ extended: true }));  // Default limit for form data

// Tello drone configuration
const TELLO_IP = '192.168.10.1';
const TELLO_PORT = 8889;
const TELLO_VIDEO_PORT = 11111;

// Create UDP client for drone commands
const droneClient = dgram.createSocket('udp4');

// Create WebSocket server
const wss = new WebSocketServer({ 
    port: streamPort,
    clientTracking: true
});

const clients = new Set(); // Set to store active clients
let nextClientId = 0;     // Counter for client IDs

// Add WebSocket server event handlers
wss.on('listening', () => {
    console.log(`WebSocket server is listening on port ${streamPort}`);
});

wss.on('error', (error) => {
    handleError(new Error('WebSocket server error: ' + error.message));
});

wss.on('connection', (ws, req) => {
    try {
        ws.clientId = nextClientId++;
        clients.add(ws);
        
        console.log(`New client ${ws.clientId} connected (Total: ${clients.size})`);

        ws.on('close', () => {
            clients.delete(ws);
            console.log(`Client ${ws.clientId} disconnected (Remaining: ${clients.size})`);
        });

        ws.on('error', (error) => {
            handleError(new Error(`Client ${ws.clientId} error: ${error.message}`));
            clients.delete(ws);
        });

    } catch (error) {
        handleError(new Error('WebSocket connection error: ' + error.message));
        ws.close(1011, 'Internal Server Error');
    }
});

// Remove the complex monitoring system
let droneState = {
    battery: null,
    lastUpdate: null
};

// Simplified monitoring - just check battery every 10 seconds
function startDroneMonitoring() {
    if (monitoringInterval) {
        // Don't create multiple intervals
        return;
    }
    
    monitoringInterval = setInterval(() => {
        droneClient.send('battery?', 0, 8, TELLO_PORT, TELLO_IP);
    }, 10000);
}

function stopDroneMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
}

// Update the message handler to store state
droneClient.on('message', (msg) => {
    try {
        const response = msg.toString().trim();
        
        // If it's a battery response (a number)
        if (!isNaN(response)) {
            droneState.battery = parseInt(response);
            droneState.lastUpdate = Date.now();
            
            // Broadcast to all connected clients
            const update = JSON.stringify({
                type: 'battery',
                value: droneState.battery,
                timestamp: droneState.lastUpdate
            });
            
            clients.forEach(client => {
                if (client.readyState === 1) {
                    client.send(update);
                }
            });
        }
        
        console.log('Drone response:', response);
    } catch (error) {
        console.error('Error processing drone response:', error);
    }
});

// Track last command sent
let lastCommand = '';

// Add route for drone commands
app.get('/drone/:command', (req, res) => {
    try {
        const command = req.params.command;
        lastCommand = command;
        
        if (command === 'streamon') {
            droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                if (err) {
                    err.clientError = true;
                    return handleError(err, res);
                }
                
                try {
                    // Start FFmpeg if not already running
                    if (!videoState.stream.process) {
                        startFFmpeg();
                    }
                    res.send('Command sent');
                } catch (error) {
                    return handleError(new Error('Error starting video stream'), res);
                }
            });
        } else if (command === 'streamoff') {
            droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                if (err) {
                    err.clientError = true;
                    return handleError(err, res);
                }
                
                // Kill the ffmpeg process if it exists
                if (videoState.stream.process) {
                    videoState.stream.process.kill();
                    videoState.stream.process = null;
                }
                res.send('Stream paused');
            });
        } else if (command === 'command') {
            droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                if (err) {
                    err.clientError = true;
                    return handleError(err, res);
                }
                
                startDroneMonitoring();
                res.send('Command sent');
            });
        } else {
            // Send other commands normally
            droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                if (err) {
                    err.clientError = true;
                    return handleError(err, res);
                }
                res.send('Command sent');
            });
        }
    } catch (error) {
        return handleError(error, res);
    }
});


// Start FFmpeg process for video streaming
function startFFmpeg() {
    console.log('Starting FFmpeg process with AMD hardware acceleration...');
    
    // Only start if no existing process
    if (videoState.stream.process) {
        console.log('FFmpeg process already running');
        return videoState.stream.process;
    }

    const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',           // Hide FFmpeg compilation info
        '-loglevel', 'error',     // Only show errors in logs
        '-y',                     // Force overwrite output files

        // Hardware-accelerated Input configuration
        '-hwaccel', 'd3d11va',                // Use DirectX 11 for hardware decoding
        '-hwaccel_output_format', 'd3d11',    // Output in D3D11 format
        '-i', `udp://0.0.0.0:${TELLO_VIDEO_PORT}?overrun_nonfatal=1&fifo_size=50000000`,

        // First output: Hardware accelerated streaming
        '-c:v', 'h264_amf',              // Use AMD's hardware encoder
        '-usage', 'ultralowlatency',     // Optimize for lowest latency
        '-quality', 'speed',             // Prefer speed over quality
        '-rc', 'cbr',                    // Constant bitrate mode
        '-b:v', '2000k',                 // Target bitrate
        '-maxrate', '2500k',             // Maximum bitrate
        '-bufsize', '2500k',             // Buffer size
        '-frame_size', '640x480',        // Output resolution
        '-r', '30',                      // Frame rate
        '-profile:v', 'main',            // H.264 profile
        '-level', '4.1',                 // H.264 level
        '-f', 'mpegts',                  // Output format for JSMpeg
        'pipe:1',                        // Output to stdout

        // Second output: JPEG frames for photo capture (minimal impact)
        '-map', '0:v:0',                 // Map video stream
        '-c:v', 'mjpeg',                 // JPEG codec for stills
        '-q:v', '2',                     // High quality for stills
        '-vf', 'fps=2',                  // 2 frames per second is enough for stills
        '-update', '1',                  // Update the same file
        '-f', 'image2',                  // Output format for stills
        join(photosDir, 'current_frame.jpg')
    ]);

    videoState.stream.process = ffmpeg;

    // Enhanced error logging for hardware acceleration
    ffmpeg.stderr.on('data', (data) => {
        const message = data.toString().trim();
        if (message && !message.includes('Last message repeated')) {
            // Filter out common non-error messages
            if (!message.includes('already exists') && 
                !message.includes('Overwrite?') &&
                !message.includes('hwaccel initialisation')) {
                console.error('FFmpeg error:', message);
            }
        }
    });

    // Handle process errors and exit
    ffmpeg.on('error', (error) => {
        handleError(new Error('FFmpeg process error: ' + error.message));
        if (videoState.stream.process === ffmpeg) {
            videoState.stream.process = null;
            if (lastCommand === 'streamon') {
                console.log('Attempting FFmpeg restart...');
                setTimeout(startFFmpeg, 1000);
            }
        }
    });

    ffmpeg.on('exit', (code, signal) => {
        if (code !== 0) {
            console.error(`FFmpeg process exited with code ${code}, signal: ${signal}`);
        }
        if (videoState.stream.process === ffmpeg) {
            videoState.stream.process = null;
            if (lastCommand === 'streamon') {
                console.log('FFmpeg process exited, attempting restart...');
                setTimeout(startFFmpeg, 1000);
            }
        }
    });

    // Stream video data directly to WebSocket clients
    ffmpeg.stdout.on('data', (chunk) => {
        if (!videoState.stream.process) return;

        // Send to all connected WebSocket clients
        clients.forEach((client) => {
            if (client.readyState === 1) {
                try {
                    client.send(chunk, { binary: true });
                } catch (err) {
                    console.error(`Failed to send to client: ${err}`);
                    clients.delete(client);
                }
            }
        });
        
        // Send to MP4 recording if active
        if (videoState.recording.process?.stdin.writable) {
            try {
                videoState.recording.process.stdin.write(chunk);
            } catch (error) {
                console.error('Failed to write to MP4 stream:', error);
                videoState.recording.process.stdin.end();
                videoState.recording.process = null;
                videoState.recording.filePath = null;
            }
        }
    });

    return ffmpeg;
}

// Modify photo capture endpoint
app.post('/capture-photo', async (req, res) => {
    if (!videoState.stream.process) {
        return res.status(400).send('Video stream not active');
    }

    try {
        const timestamp = Date.now();
        const finalPhotoPath = join(photosDir, `photo_${timestamp}.jpg`);
        const currentFramePath = join(photosDir, 'current_frame.jpg');

        await fs.promises.copyFile(currentFramePath, finalPhotoPath);
        
        res.json({ 
            fileName: `photo_${timestamp}.jpg`,
            timestamp: timestamp
        });
    } catch (error) {
        console.error('Failed to capture photo:', error);
        res.status(500).send('Failed to capture photo');
    }
});

// Replace separate process variables with a single state object
const videoState = {
    stream: {
        active: false,
        process: null
    },
    recording: {
        active: false,
        process: null,
        filePath: null
    }
};

// Function to initialize MP4 process
function initializeMP4Process() {
    console.log('Starting MP4 process...');
    
    if (videoState.recording.process) {
        console.log('MP4 process already running');
        return videoState.recording.process;
    }

    const timestamp = Date.now();
    const mp4FileName = `video_${timestamp}.mp4`;
    videoState.recording.filePath = join(mp4Dir, mp4FileName);
    
    try {
        videoState.recording.process = spawn('ffmpeg', [
            '-i', 'pipe:0',
            '-c:v', 'copy',
            '-c:a', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            '-movflags', '+faststart',
            '-y',
            videoState.recording.filePath
        ]);

        videoState.recording.process.stderr.on('data', (data) => {
            const message = data.toString().trim();
            if (message.toLowerCase().includes('error') || 
                message.toLowerCase().includes('failed')) {
                handleError(new Error(`MP4 FFmpeg: ${message}`));
            }
        });

        videoState.recording.process.on('error', (err) => {
            handleError(new Error('MP4 process error: ' + err.message));
            videoState.recording.process = null;
            videoState.recording.filePath = null;
        });

        videoState.recording.process.on('exit', (code, signal) => {
            if (code !== 0) {
                handleError(new Error(`MP4 process exited with code ${code}, signal: ${signal}`));
            }
            videoState.recording.process = null;
            videoState.recording.filePath = null;
        });

        return videoState.recording.process;
    } catch (error) {
        handleError(new Error('Failed to initialize MP4 process: ' + error.message));
        videoState.recording.process = null;
        videoState.recording.filePath = null;
        return null;
    }
}

// Add route for saving video chunks
app.post('/start-recording', (req, res) => {
    if (videoState.recording.active) {
        const error = new Error('Recording already in progress');
        error.clientError = true;
        return handleError(error, res);
    }

    try {
        if (!videoState.recording.process) {
            initializeMP4Process();
        }

        if (!videoState.recording.process || !videoState.recording.process.stdin.writable) {
            return handleError(new Error('Failed to initialize MP4 process'), res);
        }

        videoState.recording.active = true;
        res.json({ mp4FileName: path.basename(videoState.recording.filePath) });
        
    } catch (error) {
        return handleError(error, res);
    }
});

app.post('/stop-recording', async (req, res) => {
    if (!videoState.recording.active) {
        const error = new Error('No active recording');
        error.clientError = true;
        return handleError(error, res);
    }

    try {
        videoState.recording.active = false;
        
        if (videoState.recording.process) {
            videoState.recording.process.stdin.end();
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    videoState.recording.process.kill('SIGKILL');
                    reject(new Error('MP4 process termination timeout'));
                }, 5000);

                videoState.recording.process.once('exit', (code, signal) => {
                    clearTimeout(timeout);
                    if (code === 0 || signal === 'SIGKILL') {
                        resolve();
                    } else {
                        reject(new Error(`MP4 process exited with code ${code}, signal: ${signal}`));
                    }
                });
            }).catch(error => {
                console.warn('MP4 process cleanup warning:', error.message);
            });

            videoState.recording.process = null;
            videoState.recording.filePath = null;
            console.log('MP4 recording stopped and cleaned up');
        }
        
        res.send('Recording stopped');
    } catch (error) {
        return handleError(error, res);
    }
});

// Add this improved graceful shutdown handler
const gracefulShutdown = async () => {
    console.log('Starting graceful shutdown...');
    
    // Stop monitoring first
    stopDroneMonitoring();
    
    // 1. Stop accepting new connections
    wss.close(() => {
        console.log('WebSocket server closed');
    });

    // 2. Close all client connections
    clients.forEach(client => {
        try {
            client.close();
        } catch (err) {
            handleError(new Error('Error closing client: ' + err.message));
        }
    });

    // 3. Send emergency stop to drone
    try {
        await new Promise((resolve) => {
            droneClient.send('emergency', 0, 'emergency'.length, TELLO_PORT, TELLO_IP, () => {
                resolve();
            });
        });
    } catch (err) {
        handleError(new Error('Error sending emergency command: ' + err.message));
    }

    // 4. Close UDP socket
    droneClient.close();

    // 5. Kill FFmpeg processes
    if (videoState.stream.process) {
        videoState.stream.process.kill();
    }
    if (videoState.recording.process) {
        videoState.recording.process.stdin.end();
        videoState.recording.process.kill();
    }

    // 6. Close any open file streams
    if (videoState.recording.process) {
        await new Promise(resolve => videoState.recording.process.stdin.end(resolve));
    }

    console.log('Graceful shutdown completed');
    process.exit(0);
};

// Handle different termination signals
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
    process.on(signal, gracefulShutdown);
});

// Serve static files
app.use(express.static(join(__dirname, 'dist')));

// Start servers sequentially
const startServers = () => {
    app.listen(port, () => {
        console.log(`Express server running on http://localhost:${port}`);
        
        // Check WebSocket server status
        if (wss.readyState !== wss.OPEN) {
            wss.once('listening', () => {
                console.log('Both servers are running');
            });
        } else {
            console.log('Both servers are running');
        }
    });
};

startServers(); 