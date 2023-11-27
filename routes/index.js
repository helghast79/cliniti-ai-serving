"use strict";

// ================================================================
const   cfg = require('../config'),
        express = require('express'),
        asyncMiddleware = require('./asyncMiddleware'),
        router = express.Router(),
        path = require('path'),
        fs = require('fs-extra'),
        axios = require('axios'),
        http = require('http'),
        {logger} = require('../logger'),
        multer = require('multer')

// model executer function
const {runModel} = require(`../ai/runModel.js`)        


const storage = multer.memoryStorage() // or other storage options
const upload = multer({
    storage: storage,
    destination: (req, file, cb) => {
        const modelInputData = req.body
        const jobId = modelInputData.job.id
        const destinationFolder = path.join(__dirname, 'jobs', jobId)
        cb(null, destinationFolder)
    }
})



const modelList = require(`../${cfg.ai.modelsFile}`)



// middleware
// define constants and other relevant objects
router.use( '/', (req, res, next) => {
    next()
})






router.get('/models', asyncMiddleware(async (req, res, next) => {  
    return res.json(modelList)
}))







router.post('/models/:modelId/run', upload.array('files'), asyncMiddleware(async (req, res, next) => {
    const modelInputData = req.body,
          modelId = req.params.modelId
    
    const model = modelList.find(m=>m.id === modelId)
    
    const job = modelInputData.job
    const socketId = modelInputData.job.socket
    const files = req.files
    //const reqSocket = req.io.sockets.sockets.get(socketId)

    console.log('----->', model, socketId, job, files)
    
    runModel(model, modelInputData)
}))







module.exports = router