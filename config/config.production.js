'use strict';

module.exports = {
    env: 'production',
    appName: 'Cliniti AI Serving',
    http: {
        address: process.env.web_address || '0.0.0.0',
	    port: process.env.web_port || 8008
    },
    ws: {
        path: '/ws-ai'
    },
    ai: {
        uid: 1001,
        gid: 1001,
        cwd: '/srv/cliniti/cliniti-ai-inference',
        jobsQueueFile: 'jobs/jobsQueue.json',
        jobsDoneFile: 'jobs/jobsDone.json',
        modelsFile: 'ai/models.json', 
    },
    ollama: {
        host: 'http://127.0.0.1:11434'
    },
    logs: {
        infoFilename: './logs/info-%DATE%.log',
        expressFilename: './logs/express-%DATE%.log',
        datePattern: 'YYYY-MM-DD-HH',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '1d',
        auditInfoFile: './logs/info-audit.json',
        auditExpressFile: './logs/express-audit.json'
    }

}
