FROM python:3.12.3-alpine

WORKDIR /app

COPY Pipfile Pipfile.lock ./

RUN apk add --no-cache libpq-dev

RUN pip install pipenv && pipenv install --deploy --ignore-Pipfile

COPY . .

CMD ["pipenv", "run", "python", "src/main.py"]
