import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process'; 
import dgram from 'dgram'; 
import { fileURLToPath } from 'url'; 
import { dirname, join, basename } from 'path'; 
import fs from 'fs';
import serverState from './state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple error handling function
function handleError(error, res = null) {
    console.error(error.message || error);
    if (res) {
        const status = error.clientError ? 400 : 500;
        res.status(status).send(error.message || 'Internal server error');
    }
    return false;
}

// Create separate folders for different media types
const createMediaFolders = () => {
    try {
        const uploadsDir = join(__dirname, 'uploads');
        const photosDir = join(uploadsDir, 'photos');
        const mp4Dir = join(uploadsDir, 'mp4_recordings');

        [uploadsDir, photosDir, mp4Dir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
            }
        });

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

// Configure middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// WebSocket server event handlers
wss.on('listening', () => {
    console.log(`WebSocket server is listening on port ${streamPort}`);
});

wss.on('error', (error) => {
    handleError(new Error('WebSocket server error: ' + error.message));
});

wss.on('connection', (ws, req) => {
    try {
        const clientId = serverState.addClient(ws);
        console.log(`New client ${clientId} connected (Total: ${serverState.websocket.clients.size})`);

        ws.on('close', () => {
            serverState.removeClient(ws);
            console.log(`Client ${clientId} disconnected (Remaining: ${serverState.websocket.clients.size})`);
        });

        ws.on('error', (error) => {
            handleError(new Error(`Client ${clientId} error: ${error.message}`));
            serverState.removeClient(ws);
        });
    } catch (error) {
        handleError(new Error('WebSocket connection error: ' + error.message));
        ws.close(1011, 'Internal Server Error');
    }
});

// Simplified monitoring - check battery, speed and time every 10 seconds
function startDroneMonitoring() {
    if (serverState.drone.monitoringInterval) {
        return;
    }
    
    const interval = setInterval(() => {
        droneClient.send('battery?', 0, 8, TELLO_PORT, TELLO_IP);
        droneClient.send('speed?', 0, 6, TELLO_PORT, TELLO_IP);
        droneClient.send('time?', 0, 5, TELLO_PORT, TELLO_IP);
    }, 10000);

    serverState.setMonitoringInterval(interval);
}

function stopDroneMonitoring() {
    if (serverState.drone.monitoringInterval) {
        clearInterval(serverState.drone.monitoringInterval);
        serverState.setMonitoringInterval(null);
    }
}

// Update the message handler to store state
droneClient.on('message', (msg) => {
    try {
        const response = msg.toString().trim();
        
        // Update state based on response
        if (!isNaN(response)) {
            serverState.updateDroneState('battery', parseInt(response));
        } else if (response.includes('cm/s')) {
            serverState.updateDroneState('speed', response);
        } else if (response.includes('s')) {
            serverState.updateDroneState('time', response);
        }
        
        // Broadcast to all connected clients
        const update = JSON.stringify({
            type: 'droneState',
            value: serverState.getDroneState(),
            timestamp: Date.now()
        });
        
        serverState.getConnectedClients().forEach(client => {
            client.send(update);
        });
        
        console.log('Drone response:', response);
    } catch (error) {
        console.error('Error processing drone response:', error);
    }
});

// Simplified drone response handler
async function getDroneResponse(command, updateLastCommand = true) {
    if (updateLastCommand) {
        serverState.setLastCommand(command);
    }
    
    return new Promise((resolve, reject) => {
        const messageHandler = (msg) => {
            droneClient.removeListener('message', messageHandler);
            resolve(msg.toString().trim());
        };
        
        droneClient.once('message', messageHandler);
        
        setTimeout(() => {
            droneClient.removeListener('message', messageHandler);
            reject(new Error('Drone not responding'));
        }, 5000);
        
        droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
            if (err) {
                droneClient.removeListener('message', messageHandler);
                reject(err);
            }
        });
    });
}

// Add route for drone commands
app.get('/drone/:command', async (req, res) => {
    try {
        const command = req.params.command;
        
        if (command === 'command') {
            try {
                const response = await getDroneResponse(command, false);
                startDroneMonitoring();
                res.json({ status: response === 'ok' ? 'connected' : 'failed', response });
            } catch (error) {
                res.json({ status: 'failed', response: error.message });
            }
        } else if (command === 'streamon') {
            droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                if (err) {
                    err.clientError = true;
                    return handleError(err, res);
                }
                
                try {
                    // Start FFmpeg if not already running
                    if (!serverState.video.stream.process) {
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
                if (serverState.video.stream.process) {
                    serverState.video.stream.process.kill();
                    serverState.video.stream.process = null;
                }
                res.send('Stream paused');
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
    if (serverState.video.stream.process) {
        console.log('FFmpeg process already running');
        return serverState.video.stream.process;
    }

    const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',           // Hide FFmpeg compilation info
        '-loglevel', 'error',     // Only show errors in logs
        '-y',                     // Force overwrite output files

        // Input configuration
        '-fflags', '+genpts',     // Generate presentation timestamps
        '-i', `udp://0.0.0.0:${TELLO_VIDEO_PORT}?overrun_nonfatal=1&fifo_size=50000000`,

        // First output: MPEG1 video for JSMpeg streaming
        '-map', '0:v:0',         // Map video stream
        '-c:v', 'mpeg1video',    // Use MPEG1 video codec (works well with JSMpeg)
        '-b:v', '2000k',         // Increased base bitrate to 2 Mbps
        '-maxrate', '4000k',     // Increased max bitrate to 4 Mbps
        '-bufsize', '8000k',     // Doubled buffer size relative to maxrate
        '-minrate', '1000k',     // Added minimum bitrate constraint
        '-an',                   // Remove audio (drone has no audio)
        '-f', 'mpegts',          // Output format: MPEG transport stream
        '-s', '640x480',         // Video size: 640x480 pixels
        '-r', '30',              // Frame rate: 30 fps
        '-q:v', '5',             // Video quality (1-31, lower is better)
        '-tune', 'zerolatency',  // Optimize for low latency
        '-preset', 'ultrafast',  // Fastest encoding speed
        '-pix_fmt', 'yuv420p',   // Pixel format: YUV420
        '-flush_packets', '1',    // Flush packets immediately
        '-reset_timestamps', '1', // Reset timestamps at the start
        'pipe:1',                // Output to stdout for streaming

        // Second output: JPEG frames for photo capture
        '-map', '0:v:0',         // Map video stream again
        '-c:v', 'mjpeg',         // JPEG codec for stills
        '-q:v', '2',             // High quality for stills
        '-vf', 'fps=2',          // 2 frames per second is enough for stills
        '-update', '1',          // Update the same file
        '-f', 'image2',          // Output format for stills
        join(photosDir, 'current_frame.jpg')
    ]);

    serverState.video.stream.process = ffmpeg;

    // Enhanced error logging
    ffmpeg.stderr.on('data', (data) => {
        const message = data.toString().trim();
        if (message && !message.includes('Last message repeated')) {
            // Filter out common non-error messages
            if (!message.includes('already exists') && 
                !message.includes('Overwrite?')) {
                console.error('FFmpeg error:', message);
            }
        }
    });

    // Handle process errors and exit
    ffmpeg.on('error', (error) => {
        handleError(new Error('FFmpeg process error: ' + error.message));
        if (serverState.video.stream.process === ffmpeg) {
            serverState.video.stream.process = null;
            if (serverState.lastCommand === 'streamon') {
                console.log('Attempting FFmpeg restart...');
                setTimeout(startFFmpeg, 1000);
            }
        }
    });

    ffmpeg.on('exit', (code, signal) => {
        if (code !== 0) {
            console.error(`FFmpeg process exited with code ${code}, signal: ${signal}`);
        }
        if (serverState.video.stream.process === ffmpeg) {
            serverState.video.stream.process = null;
            if (serverState.lastCommand === 'streamon') {
                console.log('FFmpeg process exited, attempting restart...');
                setTimeout(startFFmpeg, 1000);
            }
        }
    });

    // Stream video data directly to WebSocket clients
    ffmpeg.stdout.on('data', (chunk) => {
        if (!serverState.video.stream.process) return;

        // Send to all connected WebSocket clients
        serverState.getConnectedClients().forEach((client) => {
            if (client.readyState === 1) {
                try {
                    client.send(chunk, { binary: true });
                } catch (err) {
                    console.error(`Failed to send to client: ${err}`);
                    serverState.removeClient(client);
                }
            }
        });
        
        // Send to MP4 recording if active
        if (serverState.video.recording.process?.stdin.writable) {
            try {
                serverState.video.recording.process.stdin.write(chunk);
            } catch (error) {
                console.error('Failed to write to MP4 stream:', error);
                serverState.video.recording.process.stdin.end();
                serverState.video.recording.process = null;
                serverState.video.recording.filePath = null;
            }
        }
    });

    return ffmpeg;
}

// Modify photo capture endpoint
app.post('/capture-photo', async (req, res) => {
    if (!serverState.video.stream.process) {
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

// Function to initialize MP4 process
function initializeMP4Process() {
    console.log('Starting MP4 process...');
    
    if (serverState.video.recording.process) {
        console.log('MP4 process already running');
        return serverState.video.recording.process;
    }

    const timestamp = Date.now();
    const mp4FileName = `video_${timestamp}.mp4`;
    serverState.video.recording.filePath = join(mp4Dir, mp4FileName);
    
    try {
        serverState.video.recording.process = spawn('ffmpeg', [
            '-i', 'pipe:0',           // Input from pipe
            '-c:v', 'libx264',        // Convert to H.264
            '-preset', 'ultrafast',    // Fastest encoding
            '-tune', 'zerolatency',    // Minimize latency
            '-crf', '23',             // Balance quality/size
            '-movflags', '+faststart', // Enable streaming
            '-y',                      // Overwrite output
            serverState.video.recording.filePath
        ]);

        serverState.video.recording.process.stderr.on('data', (data) => {
            const message = data.toString().trim();
            if (message.toLowerCase().includes('error') || 
                message.toLowerCase().includes('failed')) {
                handleError(new Error(`MP4 FFmpeg: ${message}`));
            }
        });

        serverState.video.recording.process.on('error', (err) => {
            handleError(new Error('MP4 process error: ' + err.message));
            serverState.video.recording.process = null;
            serverState.video.recording.filePath = null;
        });

        serverState.video.recording.process.on('exit', (code, signal) => {
            if (code !== 0) {
                handleError(new Error(`MP4 process exited with code ${code}, signal: ${signal}`));
            }
            serverState.video.recording.process = null;
            serverState.video.recording.filePath = null;
        });

        return serverState.video.recording.process;
    } catch (error) {
        handleError(new Error('Failed to initialize MP4 process: ' + error.message));
        serverState.video.recording.process = null;
        serverState.video.recording.filePath = null;
        return null;
    }
}

// Add route for saving video chunks
app.post('/start-recording', (req, res) => {
    if (serverState.video.recording.active) {
        const error = new Error('Recording already in progress');
        error.clientError = true;
        return handleError(error, res);
    }

    try {
        if (!serverState.video.recording.process) {
            initializeMP4Process();
        }

        if (!serverState.video.recording.process || !serverState.video.recording.process.stdin.writable) {
            return handleError(new Error('Failed to initialize MP4 process'), res);
        }

        serverState.video.recording.active = true;
        res.json({ mp4FileName: basename(serverState.video.recording.filePath) });
        
    } catch (error) {
        return handleError(error, res);
    }
});

app.post('/stop-recording', async (req, res) => {
    if (!serverState.video.recording.active) {
        const error = new Error('No active recording');
        error.clientError = true;
        return handleError(error, res);
    }

    try {
        serverState.video.recording.active = false;
        
        if (serverState.video.recording.process) {
            serverState.video.recording.process.stdin.end();
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    serverState.video.recording.process.kill('SIGKILL');
                    reject(new Error('MP4 process termination timeout'));
                }, 5000);

                serverState.video.recording.process.once('exit', (code, signal) => {
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

            serverState.video.recording.process = null;
            serverState.video.recording.filePath = null;
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
    
    stopDroneMonitoring();
    
    wss.close(() => {
        console.log('WebSocket server closed');
    });

    // Send emergency stop to drone
    try {
        await new Promise((resolve) => {
            droneClient.send('emergency', 0, 'emergency'.length, TELLO_PORT, TELLO_IP, () => {
                resolve();
            });
        });
    } catch (err) {
        handleError(new Error('Error sending emergency command: ' + err.message));
    }

    droneClient.close();
    
    // Clean up all state
    serverState.cleanup();

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