# =========================================================
# Stage 1: Build the React Vite TypeScript Frontend
# =========================================================
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy frontend packages and configuration files
COPY frontend/package*.json ./
COPY frontend/tsconfig*.json ./
COPY frontend/vite.config.ts ./

# Install npm dependencies
RUN npm ci

# Copy full frontend source code
COPY frontend/ ./

# Build production bundle (will write static assets to frontend/dist)
RUN npm run build

# =========================================================
# Stage 2: Build the FastAPI Python Production Server
# =========================================================
FROM python:3.11-slim-bookworm
WORKDIR /app

# Install system dependencies (curl for healthchecks, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source code
COPY backend/ ./backend/

# Copy the built React static assets from Stage 1 into backend's expected directory structure
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose server port (Railway automatically binds this dynamically via the $PORT env variable)
EXPOSE 8000

# Set environment variables for production
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Start the uvicorn backend server
CMD ["python", "backend/main.py"]
