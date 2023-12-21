/*jshint esversion: 6 */ 
(()=>'use strict')(); //use strict in function form
// ================================================================
const   cfg = require('../config'),
        path = require('path'),
        fs = require('fs-extra'),
        { spawn, exec } = require('child_process'),
        modelList = require(`../${cfg.ai.modelsFile}`)





const startWS = (httpServer)=>{
    const io = require("socket.io")(httpServer, {path: cfg.ws.path})

    
    io.on('connection', socket => {
        console.log(socket.id, 'connected')

        socket.emit('connected', socket.id)

        socket.on('get-ai-models', ()=>{
            socket.emit('get-ai-models-response', modelList)
        })
        
        
        socket.on('run-model-inference', async (payload) => { //payload = {job: ..., data: ...}
            
            // payload.job = {
            //     id: ...,
            //     socketId: ...,
            //     model: ...,
            //     status: 'created'
            // }
            const modelId = payload.job.model
            const modelCfg = modelList.find(m=>m.id = modelId)

            const modelInputs = payload.job.modelInputs // [{id: seriesT2, type: series}, ...]
            const jsonObj = {}
            const modelParams = {}

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
                //targetPath already exists, check inputs and output as well
                if(!fs.existsSync(inputsPath)) fs.mkdirSync(inputsPath)
                if(!fs.existsSync(outputPath)) fs.mkdirSync(outputPath)
            }

            for(const [modelInput, modelInputValue] of Object.entries(payload.data)){

                
                const inputDef = modelInputs.find(mi => mi.id === modelInput)
                if(!inputDef) {console.log('no input found'); continue}

                if(inputDef.type === 'series'){
                    const targetSeriesPath = path.join(inputsPath, inputDef.id)
                    //create if not created yet
                    if (!fs.existsSync(targetSeriesPath)) { 
                        fs.mkdirSync(targetSeriesPath)
                    }

                    //it will ether be an array of files or an array of url's to the files
                    if(Array.isArray(modelInputValue)){
                        //it's a series (array of buffers or url strings)
                        modelInputValue.forEach((element, index) => {
                            // Check if the element is a Buffer
                            if (Buffer.isBuffer(element)) {
                              // Create a file name with a unique identifier
                              const fileName = `file_${index}.dcm`
                              const filePath = path.join(targetSeriesPath, fileName)
                              // Write the buffer to a file
				
                              fs.writeFileSync(filePath, element)
                              fs.chmodSync(filePath, '777')
			                
                            } else {
                              //download file from the url

                            }

                        })
                    }else{
                        //could we have a single entry for a file or url to a file??
                        if (Buffer.isBuffer(modelInputValue)) {
                            const filePath = path.join(targetSeriesPath, `file_series.dcm`)
                            // Write the buffer to a file
                            fs.writeFileSync(filePath, modelInputValue)
                        }else{
                            //download file from the url
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
            

            // Convert the object to a JSON string
            const jsonString = JSON.stringify(jsonObj, null, 2) 
            // Specify the path where you want to write the JSON file
            const jsonPath = path.join(inputsPath, 'otherInputs.json')
            // Write the JSON string to the file
            fs.writeFileSync(jsonPath, jsonString)

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
            for(const param of modelCfg.command){

                
                if(param.type === 'fixed'){
                    if(param.value) commandArray.push(param.value)
                
                
                }else if(param.type === 'relativePath'){
                    let value = null
                    if(typeof param.value === 'object' && param.value.length){
                        value = param.value.map(p=>path.join(targetPath, p)).join(' ')
                    }else{
                        value = path.join(targetPath, param.value)
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
               await cmd(commandArray, {uid: cfg.ai.uid, gid: cfg.ai.gid,  cwd: cfg.ai.cwd })
            } catch (error) {
                console.error(error)
            }
            
            //command has finished
            const responseContent = modelCfg.response
            
            for(const responseItem of responseContent){
                 
                 //send the response to different addresses depending on the type of output
                 if(responseItem.type === 'uploadSeg'){
                    const files = fs.readdirSync(outputPath)
                    const filteredFiles = files.filter(file => path.extname(file) === `.${responseItem.fileType}`)
                    
                    if(filteredFiles && filteredFiles.length){
                    
                        const dicomFileContent = fs.readFileSync(path.join(outputPath, filteredFiles[0])) //just the first file ????
                        socket.emit('run-model-inference-response-seg', dicomFileContent)
                    }
                 
                 }else if(responseItem.type === 'object'){
                    //get the object from a file for example
                    const obj = {test: 'test obj'}
                    //send the object
                    socket.emit('run-model-inference-response-obj', obj)
                }
            }
            //job finished so delete the job folder - consider keeping it if a job management tool is used
            console.log('deleting', targetPath)
            fs.rmSync(targetPath, { recursive: true, force: true })
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




module.exports = startWS
