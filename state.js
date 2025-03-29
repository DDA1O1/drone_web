// State manager for the server
class ServerState {
    constructor() {
        this.drone = {
            connected: false,
            lastCommand: '',
            state: {
                battery: null,
                speed: null,
                time: null,
                lastUpdate: null
            },
            monitoringInterval: null
        };

        this.video = {
            stream: {
                active: false,
                process: null,  // Main FFmpeg process for streaming
                lastError: null
            },
            recording: {
                active: false,
                process: null,  // Separate FFmpeg process for MP4 recording
                filePath: null,
                lastError: null
            }
        };

        this.websocket = {
            clients: new Set(), // unique clients
            nextClientId: 1
        };
    }

    // Drone state methods
    setDroneConnection(status) {
        this.drone.connected = status;
    }

    setLastCommand(command) {
        this.drone.lastCommand = command;
    }

    updateDroneState(key, value) {
        this.drone.state[key] = value;
        this.drone.state.lastUpdate = Date.now();
    }

    setMonitoringInterval(interval) {
        this.drone.monitoringInterval = interval;
    }

    // Video streaming state methods
    setVideoStreamProcess(process = null) {
        this.video.stream.process = process;
        this.video.stream.active = process !== null;
    }

    getVideoStreamProcess() {
        return this.video.stream.process;
    }

    isVideoStreamActive() {
        return this.video.stream.active;
    }

    setVideoStreamError(error) {
        this.video.stream.lastError = error;
    }

    // Video recording state methods
    setVideoRecordingProcess(process = null) {
        this.video.recording.process = process;
    }

    setVideoRecordingActive(active) {
        this.video.recording.active = active;
    }

    setVideoRecordingFilePath(filePath) {
        this.video.recording.filePath = filePath;
    }

    getVideoRecordingProcess() {
        return this.video.recording.process;
    }

    getVideoRecordingActive() {
        return this.video.recording.active;
    }

    getVideoRecordingFilePath() {
        return this.video.recording.filePath;
    }

    setVideoRecordingError(error) {
        this.video.recording.lastError = error;
    }

    // WebSocket client methods
    addClient(ws) {
        ws.clientId = this.websocket.nextClientId++; // use 1 then increment to 2 post increment operator (X++)
        this.websocket.clients.add(ws);
        return ws.clientId;
    }

    removeClient(ws) {
        this.websocket.clients.delete(ws);
    }

    getConnectedClients() {
        return Array.from(this.websocket.clients)
            .filter(client => client.readyState === 1);
    }

    // State getters
    getDroneState() {
        return this.drone.state;
    }

    getVideoState() {
        return this.video;
    }

    getLastCommand() {
        return this.drone.lastCommand;
    }

    // Cleanup method
    cleanup() {
        if (this.drone.monitoringInterval) {
            clearInterval(this.drone.monitoringInterval);
        }
        
        // Clean up streaming FFmpeg process
        if (this.video.stream.process) {
            this.video.stream.process.kill();
            this.video.stream.process = null;
            this.video.stream.active = false;
        }
        
        // Clean up recording FFmpeg process
        if (this.video.recording.process) {
            this.video.recording.process.stdin.end();
            this.video.recording.process.kill();
            this.video.recording.process = null;
            this.video.recording.active = false;
            this.video.recording.filePath = null;
        }

        this.websocket.clients.forEach(client => {
            try {
                client.close();
            } catch (err) {
                console.error('Error closing client:', err);
            }
        });
    }
}

// Create and export a singleton instance for single source of truth
export const serverState = new ServerState();
export default serverState; 