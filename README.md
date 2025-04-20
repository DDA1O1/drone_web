# Tello Drone Control Web Interface

This project provides a web-based interface to control a Tello drone, view its video stream, and manage recordings.

## Features

*   **Real-time Video Streaming:** View the drone's camera feed directly in the browser using JSMpeg.
*   **Drone Control:** Send commands to the drone (takeoff, land, movement, etc.) via a backend server.
*   **State Display:** Monitor key drone metrics like battery level, flight time, and connection status using Server-Sent Events (SSE).
*   **Video Recording:** Record the video stream (functionality might be partially implemented based on the provided code snippets).
*   **Redux State Management:** Centralized state management for drone status and UI interactions.

## Technology Stack

*   **Frontend:**
    *   React
    *   Redux Toolkit (for state management)
    *   Tailwind CSS (for styling)
    *   Vite (build tool)
    *   JSMpeg Player (for video streaming)
*   **Backend (Node.js - `server.js`):**
    *   Express.js (web framework)
    *   `ws` (WebSocket library for video stream proxying)
    *   Node.js `dgram` (for UDP communication with the drone)
    *   Server-Sent Events (SSE) for real-time state updates

## Project Structure

```
.
├── public/
│   └── vite.svg
├── server.js           # Backend server (Node.js)
├── src/
│   ├── App.jsx           # Main application component
│   ├── assets/           # Static assets (e.g., images)
│   ├── components/       # React components
│   │   ├── control/      # Drone control components (if any)
│   │   ├── DroneStateDisplay.jsx # Displays drone status
│   │   ├── JSMpegVideoPlayer.jsx # Handles video stream display
│   │   └── VideoContainer.jsx  # Layout for video player
│   ├── hooks/            # Custom React hooks
│   │   └── useDroneStateEventSource.js # Hook for SSE connection
│   ├── store/            # Redux store configuration
│   │   ├── slices/
│   │   │   └── droneSlice.js # Redux slice for drone state
│   │   └── store.js        # Redux store setup
│   ├── index.css         # Main CSS file (imports Tailwind)
│   ├── jsmpeg-player.d.ts # TypeScript definitions for JSMpeg
│   └── main.jsx          # Application entry point
├── .gitignore
├── eslint.config.js    # ESLint configuration
├── index.html          # Main HTML file
├── jsconfig.json       # JS configuration for IntelliSense
├── package.json        # Project dependencies and scripts
├── README.md           # This file
└── vite.config.js      # Vite configuration
```

## Setup and Running

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd drone_web
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the backend server:**
    This server handles communication with the drone and streams video/state.
    ```bash
    npm run server
    # or node server.js
    ```

4.  **Start the frontend development server:**
    In a separate terminal:
    ```bash
    npm run dev
    ```
    This will open the web interface, usually at `http://localhost:5173` (check the terminal output for the exact URL).

5.  **Connect to the Tello Drone's Wi-Fi network.**

6.  **Interact with the drone** using the web interface.

## How it Works

1.  **Backend (`server.js`):**
    *   Connects to the Tello drone via UDP for sending commands and receiving state.
    *   Receives the video stream from the drone.
    *   Uses `ws` (WebSocket) to proxy the video stream to the frontend via JSMpeg format.
    *   Uses Server-Sent Events (SSE) on `/drone-state-stream` to push real-time drone state (battery, time, etc.) to the frontend.
2.  **Frontend (`src/`):**
    *   Uses React for the UI components.
    *   Uses Redux Toolkit (`droneSlice.js`) to manage the application state (connection status, stream status, drone metrics).
    *   The `useDroneStateEventSource` hook connects to the backend's SSE endpoint to receive and update the drone state in the Redux store.
    *   `JSMpegVideoPlayer` component connects to the WebSocket video stream provided by the backend and renders it.
    *   `DroneStateDisplay` component subscribes to the Redux store and displays the latest drone state.
    *   Control components (likely intended for `src/components/control/`) would send HTTP requests to the backend API endpoints (defined in `server.js`) to issue commands to the drone.

## Notes

*   Ensure the Tello drone is powered on and you are connected to its Wi-Fi network before starting the servers.
*   The backend server listens on port 3000 by default for API requests and SSE, and port 9999 for the WebSocket video stream.
*   The frontend development server typically runs on port 5173 (Vite default).