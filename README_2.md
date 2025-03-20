# Technical Deep Dive: Tello Video Streaming Architecture

## Core Components

1. **Server Components**
   - HTTP Server (Port 3000): Serves static web content
   - Stream Server (Port 3001): Handles video stream data
   - WebSocket Server: Broadcasts video frames to clients

2. **Communication Flow**
   ```
   Tello Drone -> UDP (11111) -> FFmpeg -> HTTP Stream -> WebSocket -> Browser
   ```

## Key Implementation Details

### 1. Drone Communication
```javascript
const TELLO_IP = '192.168.10.1'
const TELLO_PORT = 8889
```
- Uses UDP protocol for drone commands
- Requires initial "command" and "streamon" commands
- Video stream received on UDP port 11111

### 2. Video Processing
```javascript
FFmpeg Configuration:
- Input: UDP stream (port 11111)
- Frame rate: 30 fps
- Resolution: 960x720
- Codec: MPEG1
- Bitrate: 800k
- Output Format: MPEGTS
```

### 3. Data Flow
1. Drone streams raw H264 video over UDP
2. FFmpeg converts to MPEG1
3. Stream server receives MPEG1 data
4. WebSocket broadcasts frames to clients
5. JSMpeg decoder renders in browser

## Critical Requirements

1. **Network Setup**
   - Must be connected to Tello's WiFi network
   - Stable connection required for stream

2. **Dependencies**
   - Node.js
   - FFmpeg (system-level installation)
   - ws (WebSocket library)

3. **Port Requirements**
   - 3000: Web interface
   - 3001: Stream server
   - 11111: Drone video UDP

## Common Issues & Solutions

1. **No Video Stream**
   - Verify Tello WiFi connection
   - Confirm "command" and "streamon" success
   - Check FFmpeg installation

2. **Stream Latency**
   - Normal latency: 100-300ms
   - Reduce resolution/bitrate if needed
   - Check network stability

## React+Vite Implementation Notes

To port this to React+Vite:

1. **Backend Remains Same**
   - Keep Node.js server structure
   - Maintain WebSocket implementation

2. **Frontend Changes**
   - Replace static HTML with React components
   - Use JSMpeg as external library
   - Implement WebSocket client in React
   - Handle component lifecycle for stream cleanup

3. **Key Considerations**
   - Use environment variables for ports/IPs
   - Implement proper error boundaries
   - Handle WebSocket reconnection
   - Manage component unmounting

## Security Notes

1. Only connect to trusted Tello devices
2. Use secure WebSocket (wss://) in production
3. Implement proper error handling
4. Consider network isolation for drone control

## Performance Optimization

1. **Video Settings**
   - Adjust resolution based on needs
   - Balance bitrate vs quality
   - Consider frame rate requirements

2. **Network**
   - Minimize network hops
   - Use dedicated WiFi when possible
   - Monitor bandwidth usage
