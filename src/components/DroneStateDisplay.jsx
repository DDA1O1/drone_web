import React from 'react';
import { useSelector } from 'react-redux';
import useDroneStateWebSocket from '../hooks/useDroneStateWebSocket';

const DroneStateDisplay = () => {
  // Initialize WebSocket connection
  useDroneStateWebSocket();

  // Get drone state from Redux store
  const droneState = useSelector((state) => state.drone.droneState);
  const isConnected = useSelector((state) => state.drone.droneConnected);

  if (!isConnected) {
    return <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 m-4">Drone not connected</div>;
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 m-4">
      <h3 className="text-lg font-semibold mb-4">Drone State</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
          <label className="text-gray-300">Battery:</label>
          <span className="text-white font-mono">{droneState.battery ? `${droneState.battery}%` : 'N/A'}</span>
        </div>
        <div className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
          <label className="text-gray-300">Speed:</label>
          <span className="text-white font-mono">{droneState.speed ? `${droneState.speed} cm/s` : 'N/A'}</span>
        </div>
        <div className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
          <label className="text-gray-300">Flight Time:</label>
          <span className="text-white font-mono">{droneState.time ? `${droneState.time}s` : 'N/A'}</span>
        </div>
        <div className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
          <label className="text-gray-300">Last Update:</label>
          <span className="text-white font-mono">
            {droneState.lastUpdate
              ? new Date(droneState.lastUpdate).toLocaleTimeString()
              : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DroneStateDisplay; 