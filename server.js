import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process'; 
import dgram from 'dgram'; 
import { fileURLToPath } from 'url'; 
import { dirname, join } from 'path'; 
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
                        handleError(new Error(`Failed to send ${messageType} to client ${client.clientId}`));
                        clients.delete(client);
                    }
                }
            });
        }
        
        console.log('Drone response:', response);
    } catch (error) {
        handleError(new Error('Error processing drone response: ' + error.message));
    }
});

// Track last command sent
let lastCommand = '';

// Track monitoring intervals
let monitoringInterval = null;

// Start periodic state monitoring
function startDroneMonitoring() {
    // Clear any existing interval first
    stopDroneMonitoring();
    
    // Create a single interval that checks all metrics
    monitoringInterval = setInterval(() => {
        // Send all monitoring commands in sequence
        const commands = ['battery?', 'time?', 'speed?'];
        commands.forEach(cmd => {
            droneClient.send(cmd, 0, cmd.length, TELLO_PORT, TELLO_IP);
        });
    }, 5000); // Check all metrics every 5 seconds
}

// Stop monitoring interval
function stopDroneMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
}

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
                    if (!ffmpegProcess) {
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
                if (ffmpegProcess) {
                    ffmpegProcess.kill();
                    ffmpegProcess = null;
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

    // Only log actual errors from stderr
    ffmpeg.stderr.on('data', (data) => {
        const message = data.toString().trim();
        if (message && !message.includes('Last message repeated')) {
            if (message.toLowerCase().includes('error') || 
                message.toLowerCase().includes('failed') ||
                message.toLowerCase().includes('unable to')) {
                console.error('FFmpeg error:', message);
            }
        }
    });

    // Handle process errors and exit
    ffmpeg.on('error', (error) => {
        handleError(new Error('FFmpeg process error: ' + error.message));
        if (ffmpegProcess === ffmpeg) {
            ffmpegProcess = null;
            if (lastCommand === 'streamon') {
                setTimeout(startFFmpeg, 1000);
            }
        }
    });

    ffmpeg.on('exit', (code, signal) => {
        if (code !== 0) {
            console.error(`FFmpeg process exited with code ${code}, signal: ${signal}`);
        }
        if (ffmpegProcess === ffmpeg) {
            ffmpegProcess = null;
            if (lastCommand === 'streamon') {
                setTimeout(startFFmpeg, 1000);
            }
        }
    });

    // Stream video data directly to WebSocket clients
    ffmpeg.stdout.on('data', (chunk) => {
        if (!ffmpegProcess) return;

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
        if (mp4Process?.stdin.writable) {
            try {
                mp4Process.stdin.write(chunk);
            } catch (error) {
                console.error('Failed to write to MP4 stream:', error);
                mp4Process.stdin.end();
                mp4Process = null;
                mp4FilePath = null;
            }
        }
    });

    return ffmpeg;
}

// Modify photo capture endpoint
app.post('/capture-photo', async (req, res) => {
    if (!ffmpegProcess) {
        const error = new Error('Video stream not active');
        error.clientError = true;
        return handleError(error, res);
    }

    try {
        const timestamp = Date.now();
        const finalPhotoPath = join(photosDir, `photo_${timestamp}.jpg`);
        const currentFramePath = join(photosDir, 'current_frame.jpg');

        try {
            await fs.promises.access(currentFramePath, fs.constants.F_OK);
        } catch (err) {
            const error = new Error('No frame available for capture');
            error.clientError = true;
            return handleError(error, res);
        }

        const maxRetries = 3;
        let retries = 0;
        while (retries < maxRetries) {
            try {
                await fs.promises.copyFile(currentFramePath, finalPhotoPath);
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
                    return handleError(new Error('Failed to capture valid photo after multiple attempts'), res);
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    } catch (error) {
        return handleError(error, res);
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
                handleError(new Error(`MP4 FFmpeg: ${message}`));
            }
        });

        mp4Process.on('error', (err) => {
            handleError(new Error('MP4 process error: ' + err.message));
            mp4Process = null;
            mp4FilePath = null;
        });

        mp4Process.on('exit', (code, signal) => {
            if (code !== 0) {
                handleError(new Error(`MP4 process exited with code ${code}, signal: ${signal}`));
            }
            mp4Process = null;
            mp4FilePath = null;
        });

        return mp4Process;
    } catch (error) {
        handleError(new Error('Failed to initialize MP4 process: ' + error.message));
        mp4Process = null;
        mp4FilePath = null;
        return null;
    }
}

// Add route for saving video chunks
app.post('/start-recording', (req, res) => {
    if (isRecording) {
        const error = new Error('Recording already in progress');
        error.clientError = true;
        return handleError(error, res);
    }

    try {
        if (!mp4Process) {
            initializeMP4Process();
        }

        if (!mp4Process || !mp4Process.stdin.writable) {
            return handleError(new Error('Failed to initialize MP4 process'), res);
        }

        isRecording = true;
        res.json({ mp4FileName: path.basename(mp4FilePath) });
        
    } catch (error) {
        return handleError(error, res);
    }
});

app.post('/stop-recording', async (req, res) => {
    if (!isRecording) {
        const error = new Error('No active recording');
        error.clientError = true;
        return handleError(error, res);
    }

    try {
        isRecording = false;
        
        if (mp4Process) {
            mp4Process.stdin.end();
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    mp4Process.kill('SIGKILL');
                    reject(new Error('MP4 process termination timeout'));
                }, 5000);

                mp4Process.once('exit', (code, signal) => {
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

            mp4Process = null;
            mp4FilePath = null;
            console.log('MP4 recording stopped and cleaned up');
        }
        
        res.send('Recording stopped');
    } catch (error) {
        return handleError(error, res);
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