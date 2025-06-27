# Use Microsoft's JavaScript Node.js dev container image (Debian Bullseye, Node 18)
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:18-bullseye

# Install Python2 and build tools for better-sqlite3 native modules
RUN apt-get update \
    && apt-get install -y python2 build-essential \
    && ln -sf /usr/bin/python2 /usr/bin/python 