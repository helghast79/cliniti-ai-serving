// logger.js
const   winston = require('winston'),
        cfg = require('./config'),
        expressWinston = require('express-winston')

require('winston-daily-rotate-file')


const infoTransport = new winston.transports.DailyRotateFile({
    filename: cfg.logs.infoFilename,
    datePattern: cfg.logs.datePattern,
    zippedArchive: cfg.logs.zippedArchive,
    maxSize: cfg.logs.maxSize,
    maxFiles: cfg.logs.maxFiles,
    auditFile: cfg.logs.auditInfoFile
})

//infoTransport.on('rotate', function(oldFilename, newFilename) {
    // do something like archiving, zipping, etc.
//})

// Configure Winston logger
const logger = winston.createLogger({
  format: winston.format.combine( winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console(),
    infoTransport
  ]
})


const expressTransport = new winston.transports.DailyRotateFile({
    filename: cfg.logs.expressFilename,
    datePattern: cfg.logs.datePattern,
    zippedArchive: cfg.logs.zippedArchive,
    maxSize: cfg.logs.maxSize,
    maxFiles: cfg.logs.maxFiles,
    auditFile: cfg.logs.auditExpressFile
})

//expressTransport.on('rotate', function(oldFilename, newFilename) {
    // do something like archiving, zipping, etc.
//})

// Express middleware for logging HTTP requests
const expressLogger = expressWinston.logger({
  transports: [
    new winston.transports.Console(),
    expressTransport
  ],
  format: winston.format.combine( winston.format.splat(), winston.format.simple()),
  meta: false,
  msg: 'HTTP {{res.statusCode}} {{req.method}} {{res.responseTime}}ms {{req.url}}',
  expressFormat: true,
  colorize: false,
  ignoreRoute: function (req, res) {
    if(req.url === '/favicon.ico') return true
    else return false
  }
})

module.exports = { logger, expressLogger }
