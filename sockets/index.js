/*jshint esversion: 6 */ 
(()=>'use strict')(); //use strict in function form
// ================================================================
const   cfg = require('../config'),
        axios = require('axios'),
        http = require('http'),
        path = require('path'),
        fs = require('fs-extra'),
        FormData  = require('form-data'),
        { spawn, exec } = require('child_process'),
        modelList = require(`../${cfg.ai.modelsFile}`)






//this is needed in whenever there is no proper ssl certificate in the server
const agent = new http.Agent({
    rejectUnauthorized: false
})





const startWS = (httpServer)=>{
    const io = require("socket.io")(httpServer, {path: cfg.ws.path})


    io.on('connection', socket => {
        console.log(socket.id, 'connected')



        socket.emit('connected', socket.id)



        socket.on('get-ai-models', ()=>{
            socket.emit('get-ai-models-response', modelList)
        })
        
        







        socket.on('chat-ollama', async ({ question, chat_history }) => {
            try {
              const response = await axios({
                method: 'get',
                url: 'http://ccig.champalimaud.pt/rag-api/ask_db',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                data: {
                  question,
                  chat_history,
                  k: 25,
                  json_output: false,
                  return_metadata: false
                },
                responseType: 'stream'
              })
          
              let fullResponse = ''
          
              // Process the chunked JSON data
              response.data.on('data', chunk => {
                let text = chunk.toString()
                fullResponse += text.replace(/\n/g, '').replace(/ +/g, ' ').replace(/(<NEW_LINE>)+/g, '<br><br>')
              })
          
              // Handle the end of the stream if needed
              response.data.on('end', () => {
                if (fullResponse !== '') {
                  socket.emit('chat-ollama-response', fullResponse)
                }
              })
            } catch (error) {
              // Handle errors
              console.error('Error:', error)
            }
          })






        //run AI with local or api data 
        socket.on('run-model-inference', async (payload) => { //payload = {job: ..., data: ...}
            
            // payload.job = {
            //     id: ...,
            //     socketId: ...,
            //     model: ...,
            //     inputSource: 'local' or 'api
            //     modelInputs: ...
            //     viewerUrl: only in 'api'
            //     pacsApi: only in 'api'
            //     status: 'created'
            // }
            const isApiRequest = payload.job.inputSource === 'api'

            const modelId = payload.job.model
            const modelCfg = modelList.find(m=>m.id === modelId)

            const modelInputs = payload.job.modelInputs // [{id: seriesT2, type: series}, ...]
            const jsonObj = {}
            const modelParams = {}
            
            //only for API
            //put the various response items in an object so that the frontend
            //can chose how to display them and send all of them at the same time
            const apiResponse = {}
            
            //update status on api inference jobs
            if(isApiRequest){
                socket.emit('run-model-inference-update', {id: payload.job.id, status: 'started'})
            }
            
            //console.log(payload)

            //used for testing, holds some testing output to simulate the model inference
            const testOutputFolder = path.join(__dirname, '../jobs/test/output')

            //prevent folder attacks via job ID
            const jobFolder = payload.job.id.replaceAll('../','') //job.id is like "efc9c49b-1652-47df-a2da-e362c7208c74"

            // Specify the path where you want to save the files (in dev is always test)
            const targetPath = path.join(__dirname, '../jobs', jobFolder)
            const inputsPath = path.join(targetPath, 'inputs')
            const outputPath = path.join(targetPath, 'output')
            
            if(!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true })
                fs.mkdirSync(inputsPath)
                fs.mkdirSync(outputPath)
            }else{
                //the output has been generated before so just send it as is
                if(isApiRequest && fs.existsSync(outputPath)){
                    for(const responseItem of modelCfg.response){
                 
                        //send the response to different addresses depending on the type of output
                        if(responseItem.type === 'uploadSeg'){
                            const files = fs.readdirSync(outputPath)
                            const filteredFiles = files.filter(file => path.extname(file) === `.${responseItem.fileType}`)
                            
                            if(filteredFiles && filteredFiles.length){
                                const filePath = path.join(outputPath, filteredFiles[0])
                                const response = await uploadFile( `${payload.job.pacsApi}/instances`, filePath)
                               
                                if(response){
                                    /*
                                      Response: {
                                        ID: '59f49211-00794f4d-3cd6c2f6-72dd1627-0499d9d3',
                                        ParentPatient: '2770b02b-500794c3-28032caa-db8fc2e3-ce5b160b',
                                        ParentSeries: 'ab5be626-9a6cb4aa-ab909f74-7be543a2-b1294d45',
                                        ParentStudy: '0094790f-330e3e96-9b48e126-5b63b66e-7b0c41b5',
                                        Path: '/instances/59f49211-00794f4d-3cd6c2f6-72dd1627-0499d9d3',
                                        Status: 'AlreadyStored'
                                        }
                                     */
                                    
                                    apiResponse.series.push(response.ParentSeries)
                                }
                            }
                         
                        }else if(responseItem.type === 'object'){
                            const outputFilepath = path.join(outputPath, responseItem.file)
                            if(fs.existsSync(outputFilepath)) {
                                const fileContent = fs.readFileSync(outputFilepath, 'utf8');
                                const jsonObject = JSON.parse(fileContent);
                                apiResponse.obj = {...apiResponse.obj, ...jsonObject}
                            }
                        }
                    }
    
                    //send the response
                    socket.emit('run-model-inference-update', {id: payload.job.id, status: 'done', response: apiResponse})
                    return 
                }

                //targetPath already exists, check inputs and output as well
                if(!fs.existsSync(inputsPath)) fs.mkdirSync(inputsPath)
                if(!fs.existsSync(outputPath)) fs.mkdirSync(outputPath)
            }

            for(const [modelInput, modelInputValue] of Object.entries(payload.data)){
               
                const inputDef = modelInputs.find(mi => mi.id === modelInput)
                if(!inputDef) {console.log('no input found'); continue}
                console.log('-----', modelInput, modelInputValue)
                if(inputDef.type === 'series'){

                    //add the series to the response (only for API)
                    if(!apiResponse.series) apiResponse.series = []
                    apiResponse.series.push(modelInputValue)

                    //in dev we don't need to download the series as we're going to use the test folder anyway
                    if(isApiRequest && cfg.env === 'dev'){
                        continue
                    }

                    const targetSeriesPath = path.join(inputsPath, inputDef.id)
                    //create if not created yet
                    if (!fs.existsSync(targetSeriesPath)) { 
                        fs.mkdirSync(targetSeriesPath)
                    }

                    //it will ether be an array of files or an array of url's to the files
                    if(Array.isArray(modelInputValue)){
                        //it's a series (array of buffers or url strings)
                        modelInputValue.forEach(async (element, index) => {
                            
                            // Check if the element is a Buffer
                            if (Buffer.isBuffer(element)) {
                                // Create a file name with a unique identifier
                                const fileName = `file_${index}.dcm`
                                const filePath = path.join(targetSeriesPath, fileName)
                                // Write the buffer to a file
                                fs.writeFileSync(filePath, element)
                                //fs.chmodSync(filePath, '777')
			                
                            }

                        })
                    
                    //could we have a single entry for a file buffer?? possibly if it's a multiframe series??   
                    }else{
                        
                        if (Buffer.isBuffer(modelInputValue)) {
                            const filePath = path.join(targetSeriesPath, `file_series.dcm`)
                            // Write the buffer to a file
                            fs.writeFileSync(filePath, modelInputValue)
                            //fs.chmodSync(filePath, '777')

                        }else{
                            
                            const rawInstances = await axios.get(`${payload.job.pacsApi}/series/${modelInputValue}`, {httpsAgent: agent})
                            const instanceIds = rawInstances.data.Instances  //['dfgfj4353-fhjsdg45-rtbjhgfhd4-dfgjhdfjk', '...']
                            //console.log('-----II---', instanceIds)
                            const downloadPromises = [];
                            for (const [index, instanceId] of instanceIds.entries()) {
                                const filePath = path.join(targetSeriesPath, `file_${index}.dcm`)
                                downloadPromises.push( downloadFile(`${payload.job.pacsApi}/instances/${instanceId}/file`, filePath) )
                            }
                            await Promise.all(downloadPromises)
                        }
                    }

                //other type of inputs
                }else{
                    //input is to be included in command line
                    if(inputDef.modelParam){
                        modelParams[modelInput] = modelInputValue

                    //input to be saved in a json file and put on the inputs folder for AI model to consume
                    }else{
                        jsonObj[modelInput] = modelInputValue
                    }
                    
                }

            }
            
            //no need to save empty json file if no other inputs exist
            if(Object.keys(jsonObj).length){
                // Convert the object to a JSON string
                const jsonString = JSON.stringify(jsonObj, null, 2) 
                // Specify the path where you want to write the JSON file
                const jsonPath = path.join(inputsPath, 'otherInputs.json')
                // Write the JSON string to the file
                fs.writeFileSync(jsonPath, jsonString)
            }
            

            // sudo /home/jose_almeida/micromamba/envs/docker-env/bin/python \
            //     /home/jose_almeida/projects/nnunet_docker/utils/entrypoint-with-docker.py \
            //     --series_paths {dicom_directories} \
            //     --model_path /home/jose_almeida/projects/nnunet_docker/models/prostate_whole_gland_model \
            //     --output_dir {output_path} \
            //     --metadata_path /home/jose_almeida/projects/nnunet_docker/metadata_templates/whole-prostate.json \
            //     --folds 0 1 2 3 4 \
            //     --tta \
            //     --is_dicom

            
            //build command
            let commandArray = []
	        let isDocker = false 

            for(const param of modelCfg.command){
		        if(param.value === 'docker') isDocker = true
                
                if(param.type === 'fixed'){
                    if(param.value) commandArray.push(param.value)
                
                
                }else if(param.type === 'relativePath'){
                    let value = null
                    if(typeof param.value === 'object' && param.value.length){
                        value = param.value.map(p=>path.join(targetPath, p)).join(' ')
                    }else{
                        value = path.join(targetPath, param.value)
                    }
                    
                    //find a better way to do this (through config option maybe)
                    if(isDocker && value){
                        value = value.replaceAll('/srv/', '/data/') //docker mapping /data to /home otherwise /home will not be found
                    }
                    
                    if(value) commandArray.push(value)

                }else if(param.type === 'input'){
                    if( typeof modelParams[param.ref] !== 'undefined' && modelParams[param.ref] !== null){
                        commandArray.push(modelParams[param.ref])

                    }else if(typeof param.default !== 'undefined'){
                        commandArray.push(param.default)

                    
                    }else{
                        //ignore
                    }
                }
            }

            // commandArray = [
            // 'python', '/home/jose_almeida/projects/nnunet_docker/utils/entrypoint-with-docker.py',
            // '-i', '/home/ccig/miguel/node_apps/cliniti-ai-inference/jobs/test1/inputs/seriesT2/',
            // '-m', '/home/jose_almeida/projects/nnunet_docker/models/prostate_zone_model',
            // '-o', '/home/ccig/miguel/node_apps/cliniti-ai-inference/jobs/test1/output',
            // '-M', '/home/jose_almeida/projects/nnunet_docker/metadata_templates/prostate-zones.json',
            // '-f', '0',
            // '-t', '-D'
            // ]
            console.log(commandArray)
            console.log(commandArray.join(' '))
            
            //when testing we need to simulate a command run and we nned to copy output test files to the job output folder
            if(cfg.env === 'dev'){
                //a test command, could be other
                commandArray = ['pwd']
                //since test will not produce an output, copy some output's to the output folder for testing
                const outputTestFiles = fs.readdirSync(testOutputFolder)
                for(const testFile of outputTestFiles){
                    const sourceFilePath = path.join(testOutputFolder, testFile)
                    const destinationFilePath = path.join(outputPath, testFile)
                    if(fs.existsSync(sourceFilePath)){    
                        fs.copyFileSync(sourceFilePath, destinationFilePath)
                    }
                    
                }
            }
		
            //execute command
	        try {
               await cmd(commandArray, { uid: cfg.ai.uid, gid: cfg.ai.gid, cwd: cfg.ai.cwd })
            } catch (error) {
                console.error(error)
            }
            
            //command has finished
            const responseContent = modelCfg.response
            
            //API requests -------
            if(isApiRequest){
                
                for(const responseItem of responseContent){
                 
                    //send the response to different addresses depending on the type of output
                    if(responseItem.type === 'uploadSeg'){
                        const files = fs.readdirSync(outputPath)
                        const filteredFiles = files.filter(file => path.extname(file) === `.${responseItem.fileType}`)
                        
                        if(filteredFiles && filteredFiles.length){
                            const filePath = path.join(outputPath, filteredFiles[0])
                            //console.log('RRRRRRR', `${payload.job.pacsApi}/instances`, filePath)
                           
                            const response = await uploadFile( `${payload.job.pacsApi}/instances`, filePath)
                           
                            if(response){
                                /*
                                  Response: {
                                    ID: '59f49211-00794f4d-3cd6c2f6-72dd1627-0499d9d3',
                                    ParentPatient: '2770b02b-500794c3-28032caa-db8fc2e3-ce5b160b',
                                    ParentSeries: 'ab5be626-9a6cb4aa-ab909f74-7be543a2-b1294d45',
                                    ParentStudy: '0094790f-330e3e96-9b48e126-5b63b66e-7b0c41b5',
                                    Path: '/instances/59f49211-00794f4d-3cd6c2f6-72dd1627-0499d9d3',
                                    Status: 'AlreadyStored'
                                    }
                                 */
                                
                                apiResponse.series.push(response.ParentSeries)
                            }
                        }
                     
                    }else if(responseItem.type === 'object'){
                        const outputFilepath = path.join(outputPath, responseItem.file)
                        if(fs.existsSync(outputFilepath)) {
                            const fileContent = fs.readFileSync(outputFilepath, 'utf8');
                            const jsonObject = JSON.parse(fileContent);
                            apiResponse.obj = {...apiResponse.obj, ...jsonObject, ...(jsonObj ?? {})}
                        }
                    
                    }else if(responseItem.type === 'url'){
                        let url = ''
                        if(responseItem.base && responseItem.param){
                            let param = ''
                            if(responseItem.param === 'jobid') {
                                param = payload.job.id
                            }
                            url = `${responseItem.base}${param}` //http://ccig.champalimaud.pt/niiviewer?jobid=sdhfds-32423rd2s-dsfsdf3
                        }   
                        apiResponse.url = url
                    }
                }

                //send the response
                socket.emit('run-model-inference-update', {id: payload.job.id, status: 'done', response: apiResponse})
            

            //local file requests ------
            }else{

                for(const responseItem of responseContent){
                 
                    //send the response to different addresses depending on the type of output
                    if(responseItem.type === 'uploadSeg'){
                        const files = fs.readdirSync(outputPath)
                        const filteredFiles = files.filter(file => path.extname(file) === `.${responseItem.fileType}`)
                        
                        if(filteredFiles && filteredFiles.length){
                            //get the path to the file to send to the frontend
                            const filePath = path.join(outputPath, filteredFiles[0])
                            const dicomFileContent = fs.readFileSync(filePath) //just the first file ????
                            socket.emit('run-model-inference-response-seg', dicomFileContent)
                        }
                     
                    }else if(responseItem.type === 'object'){
                        const outputFilepath = path.join(outputPath, responseItem.file)
                        if(fs.existsSync(outputFilepath)) {
                            const fileContent = fs.readFileSync(outputFilepath, 'utf8')
                            const jsonObject = JSON.parse(fileContent)
                            socket.emit('run-model-inference-response-obj', jsonObject)
                        }
                        
                    }
                }
            }

            



            //job finished so delete the job folder if it's not api 
            if(!isApiRequest){
                console.log('deleting', targetPath)
                fs.rmSync(targetPath, { recursive: true, force: true })
            }
            
        })

     

        socket.on("disconnect", () => {
            console.log(socket.id, 'disconected')
        })
    })

    return io
}











function cmd(command, options = {}) {
 


    let p = spawn(command[0], command.slice(1), options)
	
	//p.stdin.write(options.inputPassword + '\n');
        //p.stdin.end()    
    
    return new Promise((resolve, reject) => {
        let stdoutData = ''
        let stderrData = ''

	p.stdout.on('data', (data) => {
  		console.log(`stdout: ${data}`);
	});

	p.stderr.on('data', (data) => {
  		console.error(`stderr: ${data}`);
	});

	p.on('close', (code) => {
  		console.log(`child process exited with code ${code}`);
	    if (code === 0) {
                resolve({ code })
            } else {
                reject({ code })
            }
	}); 



        p.on('error', (err) => {
            reject(err)
        })
    })
    
}










async function downloadFile(url, destinationPath) {
    const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
      })
    
      const writer = fs.createWriteStream(destinationPath)
    
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          resolve()
        })
    
        writer.on('error', err => {
          reject(err)
        })
    
        response.data.pipe(writer)
      })
  }






function uploadFile_old(url, source) {
    return new Promise( async (resolve, reject) => {
      
        const reader = fs.createReadStream(source)
    
        const formData = new FormData()
        formData.append('file', reader)
        
        try {
            const response = await axios.post(url, formData, {
                headers: {
                    ...formData.getHeaders()
                }
            })
            resolve(response.data)

        } catch (error) {
            reject(error)
        }
    })
}




async function uploadFile(url, filePath) {
    try {
        // Read the binary data from the file
        const binaryData = fs.readFileSync(filePath)
    
        // Set up the Axios request configuration
        const config = {
          headers: {
            'Content-Type': 'application/octet-stream', // Set the appropriate content type
          },
        }
    
        // Send the POST request with binary data
        const response = await axios.post(url, binaryData, config)
        return response.data
      } catch (error) {
        console.error('Error sending POST request:', error.message)
      }
  }




  // const form = new FormData()
    // form.append('file', fs.createReadStream( path.join(jobFolderOutput, outputFiles[0])) )

    // const responseUpload = await axios.post(`${pacsApi}/instances`, form, {
    //     httpsAgent: agent,
    //     headers: {
    //         ...form.getHeaders()
    //     }
    // })





module.exports = startWS
