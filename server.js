import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process'; 
import dgram from 'dgram'; 
import { fileURLToPath } from 'url'; 
import { dirname, join } from 'path'; 
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Unified error handling system
const ErrorTypes = {
    COMMAND: 'COMMAND_ERROR',
    STREAM: 'STREAM_ERROR',
    PROCESS: 'PROCESS_ERROR',
    FILE: 'FILE_ERROR',
    NETWORK: 'NETWORK_ERROR'
};

function handleError(type, error, res = null) {
    // Log the error with context
    console.error(`[${type}] ${error.message || error}`);
    
    // If response object exists, send appropriate error response
    if (res) {
        const statusCodes = {
            [ErrorTypes.COMMAND]: 400,
            [ErrorTypes.STREAM]: 503,
            [ErrorTypes.PROCESS]: 500,
            [ErrorTypes.FILE]: 500,
            [ErrorTypes.NETWORK]: 503
        };
        
        const messages = {
            [ErrorTypes.COMMAND]: 'Failed to execute drone command',
            [ErrorTypes.STREAM]: 'Video stream error',
            [ErrorTypes.PROCESS]: 'Internal process error',
            [ErrorTypes.FILE]: 'File operation failed',
            [ErrorTypes.NETWORK]: 'Network communication error'
        };
        
        res.status(statusCodes[type] || 500)
           .send(messages[type] + ': ' + (error.message || error));
    }
    
    return false;
}

// Create separate folders for different media types
const createMediaFolders = () => {
    // First creates the main uploads folder
    const uploadsDir = join(__dirname, 'uploads');
    
    // Then creates two subfolders inside uploads:
    const photosDir = join(uploadsDir, 'photos');        // for photos
    const mp4Dir = join(uploadsDir, 'mp4_recordings');   // for .mp4 files

    // Creates all folders if they don't exist
    [uploadsDir, photosDir, mp4Dir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true }); // recursive: true allows creating nested directories
        }
    });

    return { uploadsDir, photosDir, mp4Dir };
};

// Initialize folders
const { photosDir, mp4Dir } = createMediaFolders();

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
    handleError(ErrorTypes.NETWORK, 'WebSocket server error: ' + error.message);
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
            handleError(ErrorTypes.NETWORK, `Client ${ws.clientId} error: ${error.message}`);
            clients.delete(ws);
        });

    } catch (error) {
        handleError(ErrorTypes.NETWORK, 'WebSocket connection error: ' + error.message);
        ws.close(1011, 'Internal Server Error');
    }
});

// Handle drone responses with error handling
droneClient.on('message', (msg) => {
    try {
        const response = msg.toString();
        
        if (!isNaN(response)) {
            const value = parseInt(response);
            const messageType = lastCommand.replace('?', '');
            
            clients.forEach(client => {
                if (client.readyState === 1) {
                    try {
                        client.send(JSON.stringify({
                            type: messageType,
                            value: value
                        }));
                    } catch (err) {
                        handleError(ErrorTypes.NETWORK, `Failed to send ${messageType} to client ${client.clientId}`);
                        clients.delete(client);
                    }
                }
            });
        }
        
        console.log('Drone response:', response);
    } catch (error) {
        handleError(ErrorTypes.COMMAND, 'Error processing drone response: ' + error.message);
    }
});

// Track last command sent
let lastCommand = '';

// Track monitoring intervals
let monitoringIntervals = [];

// Start periodic state monitoring
function startDroneMonitoring() {
    // Clear any existing intervals first
    stopDroneMonitoring();
    
    // Check battery every 10 seconds
    monitoringIntervals.push(setInterval(() => {
        droneClient.send('battery?', 0, 'battery?'.length, TELLO_PORT, TELLO_IP);
    }, 10000));

    // Check flight time every 5 seconds
    monitoringIntervals.push(setInterval(() => {
        droneClient.send('time?', 0, 'time?'.length, TELLO_PORT, TELLO_IP);
    }, 5000));

    // Check speed every 2 seconds
    monitoringIntervals.push(setInterval(() => {
        droneClient.send('speed?', 0, 'speed?'.length, TELLO_PORT, TELLO_IP);
    }, 2000));
}

// Stop all monitoring intervals
function stopDroneMonitoring() {
    monitoringIntervals.forEach(interval => clearInterval(interval));
    monitoringIntervals = [];
}

// Add a flag to track if streaming is active
let isStreamingActive = false;

// Add route for drone commands
app.get('/drone/:command', (req, res) => {
    try {
        const command = req.params.command;
        lastCommand = command;
        
        if (command === 'streamon') {
            droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                if (err) return handleError(ErrorTypes.COMMAND, err, res);
                
                try {
                    // Start FFmpeg if not already running
                    if (!ffmpegProcess) {
                        startFFmpeg();
                    }
                    isStreamingActive = true;
                    res.send('Command sent');
                } catch (error) {
                    return handleError(ErrorTypes.PROCESS, 'Error starting video stream', res);
                }
            });
        } else if (command === 'streamoff') {
            droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                if (err) return handleError(ErrorTypes.COMMAND, err, res);
                
                isStreamingActive = false;
                res.send('Stream paused');
            });
        } else if (command === 'command') {
            droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                if (err) return handleError(ErrorTypes.COMMAND, err, res);
                
                startDroneMonitoring();
                res.send('Command sent');
            });
        } else {
            // Send other commands normally
            droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                if (err) return handleError(ErrorTypes.COMMAND, err, res);
                res.send('Command sent');
            });
        }
    } catch (error) {
        return handleError(ErrorTypes.PROCESS, error, res);
    }
});


// Add global variable for photo capture
let captureRequested = false;

// Start FFmpeg process for video streaming
function startFFmpeg() {
    console.log('Starting FFmpeg process...');
    
    // Only start if no existing process
    if (ffmpegProcess) {
        console.log('FFmpeg process already running');
        return ffmpegProcess;
    }

    const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel', 'warning',
        '-i', `udp://0.0.0.0:${TELLO_VIDEO_PORT}?overrun_nonfatal=1&fifo_size=50000000`,
        '-c:v', 'mpeg1video',
        '-b:v', '800k',
        '-r', '30',
        '-f', 'mpegts',
        '-flush_packets', '1',
        'pipe:1',
        '-c:v', 'mjpeg',
        '-q:v', '2',
        '-vf', 'fps=2',
        '-update', '1',
        '-f', 'image2',
        join(photosDir, 'current_frame.jpg')
    ]);

    ffmpegProcess = ffmpeg;

    let streamBuffer = Buffer.alloc(0);
    const MPEGTS_PACKET_SIZE = 188;
    const PACKETS_PER_CHUNK = 21;
    const CHUNK_SIZE = MPEGTS_PACKET_SIZE * PACKETS_PER_CHUNK;

    // Only log actual errors from stderr
    ffmpeg.stderr.on('data', (data) => {
        const message = data.toString().trim();
        if (message && !message.includes('Last message repeated')) {
            if (message.toLowerCase().includes('error') || 
                message.toLowerCase().includes('failed') ||
                message.toLowerCase().includes('unable to')) {
                handleError(ErrorTypes.STREAM, message);
            }
        }
    });

    // Handle fatal errors with recovery
    ffmpeg.on('error', (error) => {
        handleError(ErrorTypes.PROCESS, 'FFmpeg fatal error: ' + error.message);
        if (ffmpegProcess === ffmpeg) {
            ffmpegProcess = null;
        }
        if (isStreamingActive) {
            setTimeout(startFFmpeg, 1000);
        }
    });

    // Handle process exit with recovery
    ffmpeg.on('exit', (code, signal) => {
        if (code !== 0) {
            handleError(ErrorTypes.PROCESS, `FFmpeg process exited with code ${code}, signal: ${signal}`);
            if (ffmpegProcess === ffmpeg) {
                ffmpegProcess = null;
            }
            if (isStreamingActive) {
                setTimeout(startFFmpeg, 1000);
            }
        } else {
            console.log('FFmpeg process closed normally');
            if (ffmpegProcess === ffmpeg) {
                ffmpegProcess = null;
            }
        }
    });

    ffmpeg.stdout.on('data', (data) => {
        try {
            if (!isStreamingActive) return;
            
            streamBuffer = Buffer.concat([streamBuffer, data]);
            
            while (streamBuffer.length >= CHUNK_SIZE) {
                try {
                    const chunk = streamBuffer.subarray(0, CHUNK_SIZE);
                    streamBuffer = streamBuffer.subarray(CHUNK_SIZE);
                    
                    clients.forEach((client) => {
                        if (client.readyState === 1) {
                            try {
                                client.send(chunk, { binary: true });
                            } catch (err) {
                                handleError(ErrorTypes.NETWORK, `Failed to send chunk to client ${client.clientId}`);
                                clients.delete(client);
                            }
                        }
                    });
                    
                    if (isRecording && mp4Process && mp4Process.stdin.writable) {
                        try {
                            mp4Process.stdin.write(chunk);
                        } catch (error) {
                            handleError(ErrorTypes.PROCESS, 'Failed to write to MP4 stream');
                            isRecording = false;
                            if (mp4Process) {
                                mp4Process.stdin.end();
                                mp4Process = null;
                                mp4FilePath = null;
                            }
                        }
                    }
                } catch (error) {
                    handleError(ErrorTypes.STREAM, 'Error processing video chunk');
                    streamBuffer = Buffer.alloc(0);
                }
            }
        } catch (error) {
            handleError(ErrorTypes.STREAM, 'Error in FFmpeg data handler');
            streamBuffer = Buffer.alloc(0);
        }
    });

    return ffmpeg;
}

// Modify photo capture endpoint
app.post('/capture-photo', async (req, res) => {
    if (!ffmpegProcess) {
        return handleError(ErrorTypes.STREAM, 'Video stream not active', res);
    }

    try {
        const timestamp = Date.now();
        const finalPhotoPath = join(photosDir, `photo_${timestamp}.jpg`);
        const currentFramePath = join(photosDir, 'current_frame.jpg');

        // Check if current frame exists
        try {
            await fs.promises.access(currentFramePath, fs.constants.F_OK);
        } catch (err) {
            return handleError(ErrorTypes.FILE, 'No frame available for capture', res);
        }

        // Check if current frame is being written to
        const maxRetries = 3;
        let retries = 0;
        while (retries < maxRetries) {
            try {
                // Try to copy the file
                await fs.promises.copyFile(currentFramePath, finalPhotoPath);
                
                // Verify the copied file exists and has size > 0
                const stats = await fs.promises.stat(finalPhotoPath);
                if (stats.size > 0) {
                    return res.json({ 
                        fileName: `photo_${timestamp}.jpg`,
                        size: stats.size,
                        timestamp: timestamp
                    });
                }
                throw new Error('Captured file is empty');
            } catch (err) {
                retries++;
                if (retries >= maxRetries) {
                    return handleError(ErrorTypes.FILE, 'Failed to capture valid photo after multiple attempts', res);
                }
                // Wait 100ms before next retry
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    } catch (error) {
        return handleError(ErrorTypes.PROCESS, error, res);
    }
});

// Add global variable for mp4 process state
let mp4Process = null;
let mp4FilePath = null;
let isRecording = false;

// Function to initialize MP4 process
function initializeMP4Process() {
    console.log('Starting MP4 process...');
    
    if (mp4Process) {
        console.log('MP4 process already running');
        return mp4Process;
    }

    const timestamp = Date.now();
    const mp4FileName = `video_${timestamp}.mp4`;
    mp4FilePath = join(mp4Dir, mp4FileName);
    
    try {
        mp4Process = spawn('ffmpeg', [
            '-i', 'pipe:0',
            '-c:v', 'copy',
            '-c:a', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            '-movflags', '+faststart',
            '-y',
            mp4FilePath
        ]);

        mp4Process.stderr.on('data', (data) => {
            const message = data.toString().trim();
            if (message.toLowerCase().includes('error') || 
                message.toLowerCase().includes('failed')) {
                handleError(ErrorTypes.PROCESS, `MP4 FFmpeg: ${message}`);
            }
        });

        mp4Process.on('error', (err) => {
            handleError(ErrorTypes.PROCESS, 'MP4 process error: ' + err.message);
            mp4Process = null;
            mp4FilePath = null;
        });

        mp4Process.on('exit', (code, signal) => {
            if (code !== 0) {
                handleError(ErrorTypes.PROCESS, `MP4 process exited with code ${code}, signal: ${signal}`);
            }
            mp4Process = null;
            mp4FilePath = null;
        });

        return mp4Process;
    } catch (error) {
        handleError(ErrorTypes.PROCESS, 'Failed to initialize MP4 process: ' + error.message);
        mp4Process = null;
        mp4FilePath = null;
        return null;
    }
}

// Add route for saving video chunks
app.post('/start-recording', (req, res) => {
    if (isRecording) {
        return handleError(ErrorTypes.PROCESS, 'Recording already in progress', res);
    }

    try {
        if (!mp4Process) {
            initializeMP4Process();
        }

        if (!mp4Process || !mp4Process.stdin.writable) {
            return handleError(ErrorTypes.PROCESS, 'Failed to initialize MP4 process', res);
        }

        isRecording = true;
        res.json({ mp4FileName: path.basename(mp4FilePath) });
        
    } catch (error) {
        return handleError(ErrorTypes.PROCESS, error, res);
    }
});

app.post('/stop-recording', (req, res) => {
    if (!isRecording) {
        return handleError(ErrorTypes.PROCESS, 'No active recording', res);
    }

    try {
        isRecording = false;
        
        if (mp4Process) {
            mp4Process.stdin.end();
            
            setTimeout(() => {
                if (mp4Process) {
                    mp4Process.kill();
                    console.log('MP4 process killed');
                }
            }, 1000);
            
            mp4Process.on('exit', () => {
                console.log('MP4 process cleaned up successfully');
                mp4Process = null;
                mp4FilePath = null;
            });
        }
        
        res.send('Recording stopped');
    } catch (error) {
        return handleError(ErrorTypes.PROCESS, error, res);
    }
});

// Global variable act as a single source of truth for FFmpeg process
// This allows us to kill the old process before starting a new one multiple times before reaching the return statement
// would not have been possible if we used the return statement from startFFmpeg
let ffmpegProcess = null;

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
            console.error('Error closing client:', err);
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
        console.error('Error sending emergency command:', err);
    }

    // 4. Close UDP socket
    droneClient.close();

    // 5. Kill FFmpeg processes
    if (ffmpegProcess) {
        ffmpegProcess.kill();
    }
    if (mp4Process) {
        mp4Process.stdin.end();
        mp4Process.kill();
    }

    // 6. Close any open file streams
    if (mp4Process) {
        await new Promise(resolve => mp4Process.stdin.end(resolve));
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
const startServers = async () => {
    try {
        // Start Express server first
        await new Promise((resolve) => {
            app.listen(port, () => {
                console.log(`Express server running on http://localhost:${port}`);
                resolve();
            });
        });

        // Verify WebSocket server is running
        if (wss.readyState !== wss.OPEN) {
            console.log('Waiting for WebSocket server to be ready...');
            await new Promise((resolve) => {
                wss.once('listening', resolve);
            });
        }
        
        console.log('Both servers are running');
        
    } catch (error) {
        console.error('Error starting servers:', error);
        process.exit(1);
    }
};

startServers(); 