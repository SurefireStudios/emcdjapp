# Use a Debian-based Node.js runtime as a parent image
FROM node:20-bullseye

# Set the working directory in the container
WORKDIR /app

# Install system dependencies: FFmpeg and Python
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set up a python virtual environment
ENV VIRTUAL_ENV=/app/.venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install Python requirements (librosa, numpy)
# We install them inside the VENV to avoid PEP 668 restrictions
RUN pip install --no-cache-dir librosa numpy

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Ensure the public/mixes directory exists
RUN mkdir -p public/mixes

# Build the Next.js application
RUN npm run build

# Expose the port Next.js runs on
EXPOSE 3000

# Next.js collects completely anonymous telemetry data about general usage.
# Disable telemetry during the build and runtime.
ENV NEXT_TELEMETRY_DISABLED 1

# Start the Next.js production server
CMD ["npm", "start"]
