import cfg from '../config/index.js'
import ollama from "ollama"

async function chat(message, streamFunc) {
    ollama.config.host = cfg.ollama.host
   
	const response = await ollama.chat(message)
	for await (const part of response) {
		streamFunc(part.message.content)
	}

}

export {chat}
