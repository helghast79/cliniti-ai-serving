/*jshint esversion: 6 */ 
(()=>'use strict')(); //use strict in function form
// ================================================================



const onRunAi = socket => {
    
    socket.on('ai-message', (msg) => {
        console.log('Received message:', msg)
        socket.emit('message', `${msg} - from server`)
    })

}


module.exports = onRunAi