# Koodaamo Jukebox Client

## Local Development

### Installing Dependencies

```bash
pnpm i
```

### Environment Variables

Create a new `.env` file in the `client` directory and add the following variables:

```
VITE_DISCORD_APPLICATION_ID=YOUR_DISCORD_APPLICATION_ID
VITE_DISCORD_OAUTH2_URL=YOUR_DISCORD_OAUTH2_URL
```

### Running the Frontend Dev Server

Ports 8080 is used by default and can be customized if needed.

```bash
# Start dev server on port 8080. Proxying requests to /api to http://127.0.0.1:5000
pnpm dev

# For specifying port and proxy
VITE_API_PROXY=http://localhost:5000 VITE_PORT=8080 pnpm dev
```
