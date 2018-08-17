const chokidar = require('chokidar');
const path = require('path');
const exec = require('child_process').exec;
const jobs = require('./jobs.json').jobs;
const fs = require('fs');

// Make sure that OUTPUT_DIRECTORY is not within WATCH_DIRECTORY or you will
// encounter an inifinite loop.
const WATCH_DIRECTORY = path.resolve(process.env.CONVERT_WATCH_DIR || './input');
const OUTPUT_DIRECTORY = path.resolve(process.env.CONVERT_OUT_DIR || './output');

console.log('Initializing...');
console.log('WATCH_DIRECTORY', WATCH_DIRECTORY);
console.log('OUTPUT_DIRECTORY', OUTPUT_DIRECTORY);

// Setup chokidar watcher
const watcher = chokidar.watch(WATCH_DIRECTORY, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 3000,
    pollInterval: 100
  }
});

// `fileQueue` is an array of all added file paths that will be sequentially
// converted.
let fileQueue = [];
let queueIsWorking = false;

watcher.on('add', (filePath) => {
  fileQueue.push(filePath);

  if (!queueIsWorking) {
    startQueue();
  }
});

/**
 * Starts working on the file queue.
 */
async function startQueue() {
  queueIsWorking = true;

  while (fileQueue.length > 0) {
    let filePath = fileQueue.pop();
    await startJobs(filePath);
  }

  queueIsWorking = false;
}

/**
 * Starts the jobs defined in `jobs.json` for the given `filePath`. It also
 * creates statistics for each job and adds them to the output directory as
 * `stats.txt`.
 * @param {string} filePath Full path to the file
 */
async function startJobs(filePath) {
  const extension = path.extname(filePath);
  const fileName = path.basename(filePath, extension);  

  // create directory in output folder with the same name as the file
  const outDir = fileName + '_' + Math.floor(Math.random() * Date.now());
  const outDirPath = path.join(OUTPUT_DIRECTORY, outDir);
  if (!fs.existsSync(outDirPath)) {
    fs.mkdirSync(outDirPath);
  }
  
  let stats = [];

  for (let job of jobs) {
    const outFileName = `${fileName}_${job.name}${job.out_ext}`;
    const outFilePath = path.join(outDirPath, outFileName);

    const command = `ffmpeg -i "${filePath}" ${job.flags} -y "${outFilePath}"`;

    console.log('Starting job', job.name);

    try {
      let start = Date.now();
      await executeCommand(command);
      let duration = Math.round((Date.now() - start) / 1000);
      stats.push({
        job: job.name,
        input: filePath,
        output: outFilePath,
        duration_in_seconds: duration
      });
      console.log('Completed job', job.name);
    } catch (ex) {
      console.log('Job failed', ex);
    }
  }

  // Write statistics file
  fs.writeFileSync(path.join(outDirPath, 'stats.txt'), JSON.stringify(stats, null, 2));
};

/**
 * Spawns a command using child_process.exec() and returns a Promise.
 * @param {string} command Terminal command
 */
async function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      resolve(stdout);
    });
  });
}
