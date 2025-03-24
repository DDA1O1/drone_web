# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2024-03-21

### Changed
- Improved resource management by starting FFmpeg process only when video streaming is active
- FFmpeg process now starts only after successful 'streamon' command
- FFmpeg process is properly terminated when video streaming is stopped
- Removed automatic FFmpeg startup on server initialization

### Fixed
- Fixed unnecessary resource usage when video streaming is not active
- Fixed UDP port 11111 being occupied when not streaming

## [1.0.0] - 2024-03-21

### Added
- Initial stable release
- Real-time video streaming from Tello drone
- Drone control interface with basic flight commands
- Video recording functionality (.ts and .mp4 formats)
- Photo capture capability
- WebSocket-based live video feed
- FFmpeg integration for video processing
- Express server for handling drone commands
- Automatic media file organization

### Technical Features
- UDP communication with Tello drone
- MPEG-TS video streaming
- Real-time MP4 conversion
- Optimized video buffering and chunking
- Automatic reconnection handling
- Clean process management and error handling

[1.0.1]: https://github.com/DDA1O1/drone_web/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/DDA1O1/drone_web/releases/tag/v1.0.0 