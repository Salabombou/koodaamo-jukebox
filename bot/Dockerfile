FROM python:3.12.11-alpine

WORKDIR /app

COPY Pipfile Pipfile.lock ./

RUN apk add --no-cache libpq-dev gcc

RUN pip install pipenv && pipenv install --deploy --ignore-Pipfile

COPY . .

CMD ["pipenv", "run", "python3", "bot.py"]
