import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  droneConnected: false,
  streamEnabled: false,
  isRecording: false,
  recordingFiles: null,
  error: null,
  retryAttempts: 0,
  droneState: {
    battery: null,
    speed: null,
    time: null,
    lastUpdate: null
  }
};

export const droneSlice = createSlice({
  name: 'drone',
  initialState,
  reducers: {
    setDroneConnection: (state, action) => {
      state.droneConnected = action.payload;
      if (!action.payload) { // if drone is disconnected, reset retry attempts
        state.retryAttempts = 0;
      }
    },
    setStreamEnabled: (state, action) => {
      state.streamEnabled = action.payload;
    },
    setRecordingStatus: (state, action) => {
      state.isRecording = action.payload;
    },
    setRecordingFiles: (state, action) => {
      state.recordingFiles = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    incrementRetryAttempts: (state) => {
      state.retryAttempts += 1;
    },
    resetRetryAttempts: (state) => {
      state.retryAttempts = 0;
    },
    setDroneState: (state, action) => {
      state.droneState = action.payload;
    }
  }
});

export const {
  setDroneConnection,
  setStreamEnabled,
  setRecordingStatus,
  setRecordingFiles,
  setError,
  incrementRetryAttempts,
  resetRetryAttempts,
  setDroneState
} = droneSlice.actions;

export default droneSlice.reducer; 