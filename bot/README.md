# Koodaamo Jukebox Bot

## Local Development

### Installing Dependencies

```bash
pipenv install
```

### Environment Variables

Create a new `.env` file in the `bot` directory and add the following variables:

```
DISCORD_BOT_TOKEN=YOUR_DISCORD_BOT_TOKEN
API_BASE_URL=YOUR_API_BASE_URL
API_BASE_URL_PROD=YOUR_API_BASE_URL_PROD
JWT_SECRET=YOUR_JWT_SECRET
```

### Running the Bot

```bash
pipenv run python3 bot.py
```
