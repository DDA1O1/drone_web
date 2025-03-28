/**
 * Tello Drone Control Interface
 * This component handles the video streaming and control interface for the Tello drone.
 */

import VideoContainer from '@/components/VideoContainer'
import DroneControl from '@/components/control/DroneControl'

function App() {
  return (
    <div className="relative h-screen">
      {/* Video container - renders as background */}
      <VideoContainer />
      
      {/* Drone controls overlay */}
      <DroneControl />
    </div>
  );
}

export default App;
