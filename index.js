// app.js
const   express = require('express'),
        cfg = require('./config'),
        fs = require('fs-extra'),
        path = require('path'),
        bodyParser = require('body-parser'),
        http = require("http"),
        {logger, expressLogger } = require('./logger')

        
        
const app = express()
const httpServer = http.createServer(app)
        
// ================================================================
/* Start the websocket */
var io = require('./sockets')(httpServer)

// Configure the app to use bodyParser()
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

// Use the expressLogger middleware for logging HTTP requests
app.use(expressLogger)

// Other middleware
app.use((req, res, next) => {
    // Log additional information or middleware logic here
    next()
})

app.use(express.json())

// Routes
app.use('/', require('./routes'))

// Watch for jobs queue file changes
// fs.watchFile(path.join(__dirname, cfg.ai.jobsQueueFile), (curr, prev) => {
//     if (curr.mtime > prev.mtime) {
//         console.log('File has been changed', curr, prev)
        
//     }
// })

/* Start the server */
const server = httpServer.listen(cfg.http.port, cfg.http.address, () => {
    const host = server.address().address
    const port = server.address().port

    // Log server started
    const logServerStartMsg = `${cfg.appName} listening at http://${host}:${port} (${cfg.env})`
    logger.info(logServerStartMsg)
})
