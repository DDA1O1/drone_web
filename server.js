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
            fs.mkdirSync(dir, { recursive: true }); // recursive: true allows creating nested directories
        }
    });

    return { uploadsDir, photosDir, tsDir, mp4Dir };
};

// Initialize folders
const { photosDir, tsDir, mp4Dir } = createMediaFolders();

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
let nextClientId = 0;  // Add client ID counter

// Handle WebSocket connections
wss.on('connection', (ws) => {
    try {
        ws.clientId = nextClientId++;
        clients.add(ws);
        console.log(`Client ${ws.clientId} connected. Total clients: ${clients.size}`);
        
        ws.on('error', (error) => {
            console.error(`Client ${ws.clientId} error:`, error);
        });

        ws.on('close', () => {
            try {
                clients.delete(ws);
                console.log(`Client ${ws.clientId} disconnected. Total clients: ${clients.size}`);
                
                // Only stop video if this was the last client
                if (clients.size === 0) {
                    try {
                        if (ffmpegProcess) {
                            ffmpegProcess.kill();
                            ffmpegProcess = null;
                        }
                        // Send streamoff to drone only when last viewer disconnects
                        droneClient.send('streamoff', 0, 'streamoff'.length, TELLO_PORT, TELLO_IP, (err) => {
                            if (err) console.error('Error sending streamoff command:', err);
                        });
                    } catch (error) {
                        console.error('Error cleaning up resources:', error);
                    }
                }
            } catch (error) {
                console.error('Error in close handler:', error);
            }
        });
    } catch (error) {
        console.error('Error in WebSocket connection:', error);
        ws.close();
    }
});

// Handle drone responses
droneClient.on('message', (msg) => {
    const response = msg.toString();
    
    // Parse specific command responses
    if (!isNaN(response)) {
        if (lastCommand === 'battery?') {
            clients.forEach(client => {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({
                        type: 'battery',
                        value: parseInt(response)
                    }));
                }
            });
        } else if (lastCommand === 'time?') {
            clients.forEach(client => {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({
                        type: 'flightTime',
                        value: parseInt(response)
                    }));
                }
            });
        } else if (lastCommand === 'speed?') {
            clients.forEach(client => {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({
                        type: 'speed',
                        value: parseInt(response)
                    }));
                }
            });
        }
    }
    
    console.log('Drone response:', response);
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

// Add route for drone commands
app.get('/drone/:command', (req, res) => {
    try {
        const command = req.params.command;
        lastCommand = command;
        
        if (command === 'streamon') {
            droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                if (err) {
                    console.error('Error sending streamon command:', err);
                    return res.status(500).send('Error sending command');
                }
                try {
                    startFFmpeg();
                    res.send('Command sent');
                } catch (error) {
                    console.error('Error starting FFmpeg:', error);
                    res.status(500).send('Error starting video stream');
                }
            });
        } else if (command === 'streamoff') {
            try {
                // Find the requesting client and only close that one
                const requestingClient = Array.from(clients).find(client => 
                    client.readyState === 1
                );
                if (requestingClient) {
                    requestingClient.close();
                }
                
                // Only handle streamoff if no clients left
                if (clients.size === 0) {
                    // First send streamoff command to drone
                    droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                        if (err) {
                            console.error('Error sending streamoff command:', err);
                            return res.status(500).send('Error sending command');
                        }
                        
                        // Wait for drone acknowledgment before killing FFmpeg
                        const timeout = setTimeout(() => {
                            if (ffmpegProcess) {
                                ffmpegProcess.kill();
                                ffmpegProcess = null;
                            }
                            res.send('Stream stopped (timeout)');
                        }, 1000); // Wait up to 1 second for acknowledgment

                        // Listen for drone response
                        const responseHandler = (msg) => {
                            if (msg.toString().includes('ok')) {
                                clearTimeout(timeout);
                                if (ffmpegProcess) {
                                    ffmpegProcess.kill();
                                    ffmpegProcess = null;
                                }
                                droneClient.removeListener('message', responseHandler);
                                res.send('Stream stopped successfully');
                            }
                        };

                        droneClient.on('message', responseHandler);
                    });
                } else {
                    res.send('Client disconnected but stream continues for other viewers');
                }
            } catch (error) {
                console.error('Error handling streamoff:', error);
                res.status(500).send('Error processing streamoff command');
            }
        } else if (command === 'command') {
            droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                if (err) {
                    console.error('Error sending command:', err);
                    return res.status(500).send('Error sending command');
                }
                // Start monitoring after SDK mode is initialized
                startDroneMonitoring();
                res.send('Command sent');
            });
        } else {
            // Send other commands normally
            droneClient.send(command, 0, command.length, TELLO_PORT, TELLO_IP, (err) => {
                if (err) {
                    console.error('Error sending command:', err);
                    return res.status(500).send('Error sending command');
                }
                res.send('Command sent');
            });
        }
    } catch (error) {
        console.error('Error processing drone command:', error);
        res.status(500).send('Error processing command');
    }
});

// Define POST endpoint that handles photo saving
// express.json() middleware parses incoming JSON requests
app.post('/save-photo', express.json(), (req, res) => {
    const { imageData } = req.body;
    
    // Input validation
    if (!imageData) {
        return res.status(400).send('No image data provided');
    }

    try {
        // Remove header if exists
        const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
        
        // Generate filename with timestamp
        const fileName = `photo_${Date.now()}.png`;
        const filePath = join(photosDir, fileName);
        
        // Write file asynchronously with proper error handling
        fs.writeFile(filePath, base64Data, 'base64', (err) => {
            if (err) {
                console.error('Error saving photo:', err);
                return res.status(500).send('Error saving photo');
            }
            res.json({ fileName });
        });
    } catch (error) {
        console.error('Error processing photo data:', error);
        res.status(500).send('Error processing photo data');
    }
});

// Add route for saving video chunks
let recordingStream = null;
let mp4Process = null;

app.post('/start-recording', (req, res) => {
    // Check if recording is already in progress
    if (recordingStream || mp4Process) {
        return res.status(409).send('Recording already in progress');
    }

    const timestamp = Date.now();
    const tsFileName = `video_${timestamp}.ts`;
    const mp4FileName = `video_${timestamp}.mp4`;
    const tsFilePath = join(tsDir, tsFileName);
    const mp4FilePath = join(mp4Dir, mp4FileName);
    
    try {
        // Create write stream
        recordingStream = fs.createWriteStream(tsFilePath);
        
        // Set up the mp4 conversion process
        mp4Process = spawn('ffmpeg', [
            '-i', 'pipe:0',
            '-c:v', 'copy',
            '-c:a', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            '-movflags', '+faststart',
            '-y',
            mp4FilePath
        ]);

        // Add error handlers
        mp4Process.stderr.on('data', (data) => {
            console.log('FFmpeg MP4:', data.toString());
        });

        mp4Process.on('error', (err) => {
            console.error('FFmpeg MP4 error:', err);
        });

        // Wait for streams to be ready before responding
        recordingStream.on('open', () => {
            if (mp4Process && mp4Process.stdin.writable) {
                res.json({ tsFileName, mp4FileName });
            } else {
                cleanupAndRespond('MP4 process failed to initialize');
            }
        });
        
        recordingStream.on('error', (err) => {
            cleanupAndRespond(`TS stream error: ${err.message}`);
        });
        
        function cleanupAndRespond(errorMsg) {
            if (recordingStream) recordingStream.end();
            if (mp4Process && mp4Process.stdin.writable) mp4Process.stdin.end();
            res.status(500).send(errorMsg || 'Failed to start recording');
        }
        
    } catch (error) {
        // Clean up if error occurs during setup
        if (recordingStream) {
            recordingStream.end();
            recordingStream = null;
        }
        if (mp4Process) {
            mp4Process.kill();
            mp4Process = null;
        }
        console.error('Error starting recording:', error);
        res.status(500).send('Failed to start recording');
    }
});

app.post('/stop-recording', (req, res) => {
    if (recordingStream || mp4Process) {
        try {
            if (recordingStream) {
                // Attach handlers BEFORE ending the stream
                recordingStream.on('finish', () => {
                    recordingStream = null;
                });
                
                recordingStream.on('error', (err) => {
                    console.error('Error closing recording stream:', err);
                    recordingStream = null;
                });
                
                // End the stream after handlers are attached
                recordingStream.end();
            }
            
            if (mp4Process && mp4Process.stdin.writable) {
                mp4Process.on('close', (code) => {
                    console.log(`MP4 process closed with code ${code}`);
                    mp4Process = null;
                });
                
                mp4Process.stdin.end();
            }
            
            res.send('Recording stopped');
        } catch (err) {
            console.error('Error stopping recording:', err);
            res.status(500).send('Error stopping recording');
        }
    } else {
        res.status(400).send('No active recording');
    }
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

    let streamBuffer = Buffer.alloc(0); // Buffer to store video data
    const MPEGTS_PACKET_SIZE = 188; // MPEG-TS packet size
    const PACKETS_PER_CHUNK = 21; // Send ~4KB (21 * 188 = 3948 bytes)
    const CHUNK_SIZE = MPEGTS_PACKET_SIZE * PACKETS_PER_CHUNK;

    ffmpeg.stdout.on('data', (data) => {
        try {
            // Combine new data with existing buffer
            streamBuffer = Buffer.concat([streamBuffer, data]);
            
            // While we have enough packets to make a chunk
            while (streamBuffer.length >= CHUNK_SIZE) {
                try {
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
                                console.error(`Error sending chunk to client ${client.clientId}:`, err);
                                // Close problematic client connection
                                try {
                                    client.close();
                                } catch (closeErr) {
                                    console.error(`Error closing client ${client.clientId}:`, closeErr);
                                }
                            }
                        }
                    });
                    
                    // Save to both formats if recording
                    if (recordingStream) {
                        try {
                            // write to .ts file directly
                            recordingStream.write(chunk);
                            // write to Mp4 file using ffmpeg process
                            if (mp4Process && mp4Process.stdin.writable) {
                                mp4Process.stdin.write(chunk);
                            }
                        } catch (error) {
                            console.error('Error writing to recording streams:', error);
                        }
                    }
                } catch (error) {
                    console.error('Error processing video chunk:', error);
                    // Reset stream buffer on error to prevent corruption
                    streamBuffer = Buffer.alloc(0);
                }
            }
        } catch (error) {
            console.error('Error in FFmpeg data handler:', error);
            // Reset stream buffer on error
            streamBuffer = Buffer.alloc(0);
        }
    });

    ffmpeg.stderr.on('data', (data) => {
        const message = data.toString();
        if (!message.includes('Last message repeated')) {
            console.log('FFmpeg:', message);
        }
    });

    ffmpeg.on('error', (error) => {
        console.error('FFmpeg process error:', error);
        ffmpegProcess = null;
        setTimeout(startFFmpeg, 1000);
    });

    ffmpeg.on('exit', (code, signal) => {
        console.log(`FFmpeg process ${code ? 'exited with code ' + code : 'killed with signal ' + signal}`);
        ffmpegProcess = null;
        setTimeout(startFFmpeg, 1000);
    });

    return ffmpeg; // Return the FFmpeg instance
}

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
        mp4Process.kill();
    }

    // 6. Close any open file streams
    if (recordingStream) {
        await new Promise(resolve => recordingStream.end(resolve));
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

// Start servers
app.listen(port, () => {
    console.log(`Express server running on http://localhost:${port}`);
    console.log(`WebSocket server running on ws://localhost:${streamPort}`);
}); 