/*jshint esversion: 6 */ 
(()=>'use strict')(); //use strict in function form
// ================================================================
const   cfg                 = require('../config')



const startWS = (httpServer)=>{
    const io = require("socket.io")(httpServer, {path: cfg.ws.path})

    
    io.on('connection', socket => {
        console.log(socket.id, 'connected')

        socket.emit('connected', socket.id)
        // socket.on('message', (msg) => {
        //     console.log('Received message:', msg)
        //     socket.emit('message', `${msg} - from server`)
        // })

        //require('./socketRunAi')


        socket.on("disconnect", () => {
            console.log(socket.id, 'disconected')
        })
    })

    return io
}


module.exports = startWS