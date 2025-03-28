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
                process: null
            },
            recording: {
                active: false,
                process: null,
                filePath: null
            }
        };

        this.websocket = {
            clients: new Set(),
            nextClientId: 0
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

    // Video state methods
    setVideoStreamState(active, process = null) {
        this.video.stream.active = active;
        this.video.stream.process = process;
    }

    setRecordingState(active, process = null, filePath = null) {
        this.video.recording.active = active;
        this.video.recording.process = process;
        this.video.recording.filePath = filePath;
    }

    // WebSocket client methods
    addClient(ws) {
        ws.clientId = this.websocket.nextClientId++;
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

    // Cleanup method
    cleanup() {
        if (this.drone.monitoringInterval) {
            clearInterval(this.drone.monitoringInterval);
        }
        
        if (this.video.stream.process) {
            this.video.stream.process.kill();
        }
        
        if (this.video.recording.process) {
            this.video.recording.process.stdin.end();
            this.video.recording.process.kill();
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

// Create and export a singleton instance
export const serverState = new ServerState();
export default serverState; 