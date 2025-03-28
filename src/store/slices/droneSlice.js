import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  droneConnected: false,
  videoConnected: false,
  streamEnabled: false,
  isRecording: false,
  recordingFiles: null,
  error: null,
  retryAttempts: 0
};

export const droneSlice = createSlice({
  name: 'drone',
  initialState,
  reducers: {
    setDroneConnection: (state, action) => {
      state.droneConnected = action.payload;
      if (!action.payload) {
        state.retryAttempts = 0;
      }
    },
    setVideoConnection: (state, action) => {
      state.videoConnected = action.payload;
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
    }
  }
});

export const {
  setDroneConnection,
  setVideoConnection,
  setStreamEnabled,
  setRecordingStatus,
  setRecordingFiles,
  setError,
  incrementRetryAttempts,
  resetRetryAttempts
} = droneSlice.actions;

export default droneSlice.reducer; 