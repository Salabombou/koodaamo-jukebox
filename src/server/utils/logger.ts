import winston from 'winston';

winston.configure({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.printf((info) => `[${info.timestamp}] ${info.level}: ${info.message}`),
    winston.format.colorize({
      all: true,
      colors: {
        info: 'blue',
        error: 'red',
        warn: 'yellow',
        debug: 'green'
      }
    }),
    winston.format.errors({
      stack: process.env.NODE_ENV === 'production' ? false : true
    }),
    winston.format.splat()
  ),

  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.uncolorize(),
      maxsize: 1024 * 1024 * 10,
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.uncolorize(),
      maxsize: 1024 * 1024 * 10,
      maxFiles: 5
    })
  ],
  exitOnError: false
});

export default winston;
