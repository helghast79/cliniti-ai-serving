const   axios     = require('axios'),
        crypto    = require("crypto"),
        fs        = require('fs-extra'),
        path      = require('path'),
        http     = require('http'),
        { spawn } = require('child_process'),
        process   = require("process"),
        FormData  = require('form-data')
       



//this is needed in whenever there is no proper ssl certificate in the server
const agent = new http.Agent({
    rejectUnauthorized: false
})


const inputFolderName = 'input'
const outputFolderName = 'output'
const command = ['monai-deploy', 'run', 'my_app_pcai:latest']


//start executing the model
const runModel = async (model, modelInputData, res = console.log) => {
    console.time("modelExecuteTime")
    //model
    // {
    //   "id": "prostate_nr1",
    //   "name": "Prostate Gland Segmentation",
    //   "version": "0.1",
    //   "releaseDate": "2023-02-09",
    //   "command": "monai run my_app_pcai:latest",
    //   "params": ["input/images", "output"]
    // },

    const {pacsApi, seriesT2} = modelInputData
    
    //create an ID for this job
    const jobId = crypto.randomBytes(16).toString("hex")
    const jobFolder = path.join(__dirname, `./${jobId}`)
    const jobFolderInput = path.join(jobFolder, inputFolderName)
    const jobFolderOutput = path.join(jobFolder, outputFolderName)
    
    //create folder with job id and required subfolders
    fs.mkdirsSync(jobFolder)
    fs.mkdirsSync(jobFolderInput)
    fs.mkdirsSync(jobFolderOutput)


    const resp = await axios.get(`${pacsApi}/series/${seriesT2}`, {
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Accept" : "application/json"
        }
    })
    const {Instances} = resp.data
    const totalInstances = Instances.length
    
    for(const id of Instances){
       await downloadFile(`${pacsApi}/instances/${id}/file`, path.join(jobFolderInput, `${id}.dcm`))
    }
    
    //we can also download the whole series as a numpy array which is about 6x faster
    //await downloadFile(`${pacsApi}/series/${seriesT2}/numpy`, path.join(jobFolder, 't2', `${seriesT2}.numpy`))
    
    //files are ready so start the python mode
    res('-->', [...command, jobFolderInput, jobFolderOutput].join(' '))
    
    // const code = await cmd([...command, jobFolderInput, jobFolderOutput], {cwd: '/home/ccig/Desktop/monai_app/basic-monai-deploy-scaffold'})
    // console.log('script ended ----- ', code)

    // //get the output of files
    // const outputFiles = fs.readdirSync(jobFolderOutput, {withFileTypes: true})
    //   .filter(item => !item.isDirectory())
    //   .map(item => item.name)
    
    // if(!outputFiles){
    //   console.log("no files in output folder")
    //   return {err: "no files in output folder"}
    // }
    
    // const form = new FormData()
    // form.append('file', fs.createReadStream( path.join(jobFolderOutput, outputFiles[0])) )

    // const responseUpload = await axios.post(`${pacsApi}/instances`, form, {
    //     httpsAgent: agent,
    //     headers: {
    //         ...form.getHeaders()
    //     }
    // })

    fs.rmSync(jobFolder, { recursive: true, force: true })

    res("end")
    

	  console.timeEnd("modelExecuteTime")

}
  









  async function downloadFile (url, destination) {  
    const writer = fs.createWriteStream(destination)
  
    axios.get(url,{
        httpsAgent: agent,
        responseType: 'stream',
    }).then( response => {
        response.data.pipe(writer)
    })
  
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve)
      writer.on('error', reject)
    })
  }






  function cmd(command, options) {
    let p = spawn(command[0], command.slice(1), options)
    return new Promise((resolveFunc) => {
      p.stdout.on("data", (x) => {
        process.stdout.write(x.toString())
      });
      p.stderr.on("data", (x) => {
        process.stderr.write(x.toString())
      });
      p.on("exit", (code) => {
        resolveFunc(code)
      });
    })
  }







  //mock data
  //run({seriesT2: 'f7b2334d-deb17e20-25287669-996d3f56-57361da6', pacsApi: 'https://cliniti.local/orthanc1'}, console.log)


module.exports = {
    runModel
}