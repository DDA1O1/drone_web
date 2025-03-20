# Technical Deep Dive: Tello Video Streaming Architecture

## Core Components

1. **Server Components**
   - HTTP Server (Port 3000): Serves static web content and handles drone commands
   - WebSocket Server (Port 3001): Broadcasts video stream data to clients
   - FFmpeg Process: Handles video transcoding

2. **Communication Flow**
   ```
   Tello Drone (UDP 11111) -> FFmpeg -> WebSocket (3001) -> Browser (JSMpeg)
   ```

## Key Implementation Details

### 1. Drone Communication
```javascript
const TELLO_IP = '192.168.10.1'
const TELLO_PORT = 8889
const TELLO_VIDEO_PORT = 11111
```
- Uses UDP protocol for drone commands
- Requires initial "command" and "streamon" commands
- Video stream received on UDP port 11111

### 2. Video Processing
```javascript
FFmpeg Configuration:
- Input: UDP stream (port 11111)
- Frame rate: 30 fps
- Resolution: 640x480
- Codec: MPEG1
- Bitrate: 800k
- Buffer size: 3000k
- Preset: ultrafast
- Tune: zerolatency
```

### 3. Data Flow
1. Drone streams H264 video over UDP
2. FFmpeg converts to MPEG1 with optimized settings
3. Server chunks data into 4KB packets
4. WebSocket broadcasts chunks to clients
5. JSMpeg decoder renders in browser

## Critical Requirements

1. **Network Setup**
   - Must be connected to Tello's WiFi network
   - Stable connection required for stream
   - Dedicated WiFi recommended for best performance

2. **Dependencies**
   - Node.js
   - FFmpeg (system-level installation)
   - @cycjimmy/jsmpeg-player (client-side)
   - ws (WebSocket library)

3. **Port Requirements**
   - 3000: Web interface & API
   - 3001: WebSocket stream server
   - 11111: Drone video UDP

## Common Issues & Solutions

1. **No Video Stream**
   - Verify Tello WiFi connection
   - Confirm "command" and "streamon" success
   - Check FFmpeg installation
   - Ensure ports 3001 and 11111 are not in use

2. **Stream Latency & Performance**
   - Current optimized settings:
     - 640x480 resolution
     - 30fps frame rate
     - 800k bitrate
     - 4KB chunk size for WebSocket
   - Chunked data transmission to prevent overwhelming WebSocket
   - Automatic FFmpeg process recovery
   - Buffer management for smooth playback

## React+Vite Implementation Notes

1. **Backend Features**
   - Express server for static files and API
   - WebSocket server for stream broadcasting
   - FFmpeg process management with auto-restart
   - Chunked data transmission

2. **Frontend Implementation**
   - JSMpeg player with optimized settings
   - WebSocket client with reconnection logic
   - Error handling and status monitoring
   - Clean component unmounting

3. **Key Optimizations**
   - Reduced video buffer size
   - Progressive loading
   - Hardware acceleration when available
   - Automatic stream recovery

## Security Notes

1. Only connect to trusted Tello devices
2. Implement proper error handling
3. Clean process management with SIGINT handling
4. Protected drone command API endpoints

## Performance Optimization

1. **Video Settings**
   - Optimized FFmpeg parameters
   - Balanced quality vs latency
   - Efficient chunk size (4KB)
   - Proper buffer management

2. **Network**
   - UDP overrun handling
   - Large FIFO buffer (50MB)
   - Binary WebSocket transmission
   - Automatic reconnection logic

3. **Resource Management**
   - Proper process cleanup
   - Memory-efficient chunking
   - Automatic error recovery
   - Client connection tracking
