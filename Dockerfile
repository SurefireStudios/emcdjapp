# Use a Debian-based Node.js runtime as a parent image.
# bookworm (Debian 12) ships Python 3.11; bullseye ships 3.9, which is below the 3.10+
# the setup script and docs ask for.
FROM node:20-bookworm

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

# Install Python requirements inside the VENV to avoid PEP 668 restrictions.
# Uses requirements.txt so the container and a local checkout stay in sync.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node dependencies.
# --ignore-scripts skips scripts/setup.js: it would build a second virtualenv, and the
# Python environment is already provisioned above.
RUN npm ci --ignore-scripts

# Copy the rest of the application code
COPY . .

# Build the Next.js application
RUN npm run build

# Expose the port Next.js runs on
EXPOSE 3000

# Next.js collects completely anonymous telemetry data about general usage.
# Disable telemetry during the build and runtime.
ENV NEXT_TELEMETRY_DISABLED 1

# Start the Next.js production server
CMD ["npm", "start"]
