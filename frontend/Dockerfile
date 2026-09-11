FROM node:22-alpine

WORKDIR /react

# Install package.json + lockfile first so dependency install is cached by
# Docker across rebuilds (the lockfile is committed — see .gitignore).
COPY package*.json ./

RUN npm install

# Vite dev server with HMR + the `serve` fallback used if entrypoint build fails.
RUN npm install -g serve vite

COPY entrypoint.sh .
RUN chmod +x ./entrypoint.sh

COPY . .

EXPOSE 5173

# Runs Vite directly (HMR), not `serve dist`, so edits hot-reload live.
CMD ["./entrypoint.sh"]
