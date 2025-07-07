import os
import dotenv

dotenv.load_dotenv()

API_BASE_URL = os.getenv("API_BASE_URL")
if not API_BASE_URL:
    raise RuntimeError("API_BASE_URL environment variable is not set")

API_BASE_URL_PROD = os.getenv("API_BASE_URL_PROD")
if not API_BASE_URL_PROD:
    raise RuntimeError("API_BASE_URL_PROD environment variable is not set")

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is not set")

DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
if not DISCORD_BOT_TOKEN:
    raise RuntimeError("DISCORD_BOT_TOKEN environment variable is not set")
