import logger from 'winston';
import 'winston-daily-rotate-file';

logger.configure({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',

    format: logger.format.combine(
        logger.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        logger.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`),
        logger.format.colorize({
            all: true,
            colors: {
                info: 'blue',
                error: 'red',
                warn: 'yellow',
                debug: 'green'
            }
        }),
        logger.format.errors({
            stack: process.env.NODE_ENV === 'development'
        }),
        logger.format.splat()
    ),

    transports: [
        new logger.transports.Console(),
        new logger.transports.DailyRotateFile({
            filename: 'logs/%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
            format: logger.format.uncolorize()
        })
    ],
    exitOnError: false
});
