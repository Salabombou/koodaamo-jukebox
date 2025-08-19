# Koodaamo Jukebox

Music listen-along app for Discord Activity and browser written in React, ASP.NET and py-cord.

## Deployment

Copy the `.env.example` to `.env` and fill it accordingly
```bash
cp .env.example .env
```

Deploy with docker-compose
```bash
docker-compose up --build -d
```

## Local Development

- [Frontend (client)](client/README.md)
- [API Backend (server)](server/README.md)
- [Discord Bot (bot)](bot/README.md)

Refer to each component's README for setup, environment variables, and running instructions.
