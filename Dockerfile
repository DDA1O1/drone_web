# Stage 1: Build the React frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# Install dependencies needed for building the frontend
RUN npm install
COPY . .
# Set NODE_ENV to production for optimized build
ENV NODE_ENV=production
# Run the build script defined in package.json
RUN npm run build

# Stage 2: Setup the production environment
FROM node:20-bookworm-slim AS production
WORKDIR /app

# Install ffmpeg and necessary dependencies
# Using bookworm-slim (Debian-based) as it has readily available ffmpeg packages
# Update package lists, install ffmpeg and clean up apt cache to reduce image size
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg procps && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy essential files from the root context
COPY package.json package-lock.json* ./

# Install only production dependencies for the server
RUN npm install --omit=dev

# Copy the built frontend from the builder stage
COPY --from=builder /app/dist ./dist

# Copy server code and state management
COPY server.js ./
COPY state.js ./

# Create the uploads directory structure within the image
# Grant write permissions (adjust if running as non-root later)
RUN mkdir -p uploads/photos uploads/mp4_recordings && \
    chmod -R 777 uploads

# Define the volume for persistent media storage
# This allows users to map a host directory to store photos/videos outside the container
VOLUME /app/uploads

# Expose the ports the application uses
# Express API and SSE
EXPOSE 3000
# WebSocket Video Stream
EXPOSE 3001
# Note: UDP ports for drone communication (8889, 11111) are outbound from the container
# and typically don't need EXPOSE unless something external needs to connect *to* them within the container.

# Set the command to run the application using the start script
CMD ["node", "server.js"]

# Optional: Add a non-root user for security
# RUN useradd -m appuser
# RUN chown -R appuser:appuser /app
# USER appuser
# Note: If using a non-root user, ensure file permissions (especially for 'uploads') are correct.
# The chmod 777 above is permissive; adjust as needed if using a dedicated user.