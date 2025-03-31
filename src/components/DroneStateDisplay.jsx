import React from 'react';
import { useSelector } from 'react-redux';
import { useDroneStateEventSource } from '@hooks/useDroneStateEventSource';

const DroneStateDisplay = () => {
  // Initialize EventSource connection
  useDroneStateEventSource();

  // Get drone state from Redux store
  const droneState = useSelector((state) => state.drone.droneState);

  return (
    <div className="flex items-center justify-center w-full min-h-[200px]">
      <div className="absolute top-5.5 left-50 z-30">
        {/* Battery Status */}
        <div className="bg-transparent backdrop-blur-sm rounded-lg p-2 transition-all duration-200 group">
          <div className="flex items-center gap-0.5">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-15 text-green-400/90" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M3 7h14a2 2 0 012 2v6a2 2 0 01-2 2H3a2 2 0 01-2-2V9a2 2 0 012-2zm14 1h2v6h-2V8z"
              />
            </svg>
            <div className="text-center bg-black/20 rounded-md px-2 py-1 w-full group-hover:bg-black/30 transition-all duration-200">
              <span className={`text-sm font-mono font-semibold ${
                !droneState.battery ? 'text-gray-500' :
                droneState.battery < 20 ? 'text-red-400/90' : 
                droneState.battery < 50 ? 'text-yellow-400/90' : 
                'text-green-400/90'
              }`}>
                {droneState.battery ? `${droneState.battery}%` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>


      {/* Flight Time */}
      <div className="absolute top-20 right-10 z-30">
        <div className="bg-transparent backdrop-blur-sm rounded-lg p-2 bg-purple-500/10 hover:bg-purple-500/10 transition-all duration-200 group">
          <div className="flex items-center gap-1">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-15 text-purple-400/90" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-center bg-black/20 rounded-md px-2 py-1 w-full group-hover:bg-black/30 transition-all duration-200">
              <span className="text-sm font-mono font-semibold text-purple-400/90">
                {droneState.time ? `${droneState.time}` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Last Update */}
      <div className="absolute top-30 right-10 z-30">
        <div className="bg-transparent backdrop-blur-sm rounded-lg p-2 bg-amber-500/10 hover:bg-amber-500/10 transition-all duration-200 group">
          <div className="flex items-center gap-1">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-15 text-amber-400/90" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <div className="text-center bg-black/20 rounded-md px-2 py-1 w-full group-hover:bg-black/30 transition-all duration-200">
              <span className="text-sm font-mono font-semibold text-amber-400/90">
                {droneState.lastUpdate
                  ? new Date(droneState.lastUpdate).toLocaleTimeString()
                  : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DroneStateDisplay; 