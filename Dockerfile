# Multi-stage lightweight Cloud Container for Image Storage & Sharing
FROM python:3.11-alpine

# Set working directory inside container
WORKDIR /app

# Metadata labels for Cloud Computing evaluation
LABEL maintainer="Cloud Computing Project"
LABEL project="Cloud-Based Image Storage and Sharing System"
LABEL version="1.0.0"

# Copy system code
COPY server.py index.html style.css app.js ./

# Create persistent cloud storage and database volumes
RUN mkdir -p /app/cloud_storage

# Cloud Service Port
EXPOSE 5000

# Healthcheck for container orchestrators (Kubernetes / ECS / Swarm)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/api/stats')" || exit 1

# Start Cloud Storage Engine
CMD ["python3", "server.py"]
