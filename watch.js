const chokidar = require('chokidar');
const path = require('path');
const exec = require('child_process').exec;
const jobs = require('./jobs.json').jobs;
const fs = require('fs');

// Make sure that OUTPUT_DIRECTORY is not within WATCH_DIRECTORY or you will
// encounter an inifinite loop.
const WATCH_DIRECTORY = path.resolve('./input');
const OUTPUT_DIRECTORY = path.resolve('./output');


let watcher = chokidar.watch(WATCH_DIRECTORY, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 3000,
    pollInterval: 100
  }
});


watcher.on('add', (filePath) => {
  const extension = path.extname(filePath);
  const fileName = path.basename(filePath, extension);  

  // create directory in output folder with the same name as the file
  const targetDirectory = path.join(OUTPUT_DIRECTORY, fileName);
  if (!fs.existsSync(targetDirectory)) {
    fs.mkdirSync(targetDirectory);
  }
  
  for (let job of jobs) {
    const outputFileName = `${fileName}_${job.name}${job.out_ext}`;
    const outputPath = path.join(OUTPUT_DIRECTORY, fileName, outputFileName);

    const command = `ffmpeg -i "${filePath}" ${job.flags} -y "${outputPath}"`;

    console.log('Starting job', job.name);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(error);
      }
      console.log('Completed job', job.name);
    });
  }
});
