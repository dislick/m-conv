const chokidar = require('chokidar');
const path = require('path');
const exec = require('child_process').exec;
const tasks = require('./m-conv-tasks.json').tasks;
const fs = require('fs-extra');

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



let fileQueue = []; // { path: string, type: string }[]
let queueIsWorking = false;

watcher.on('add', (filePath) => {
  let extension = path.extname(filePath);

  for (let task of tasks) {
    let regex = new RegExp(`\.(${task.matched_ext.join('|')})`, 'i');
    if (regex.test(extension)) {
      // matches!
      fileQueue.push({
        path: filePath,
        type: task.group
      });
    }
  }

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
    let file = fileQueue.pop();
    await startJobs(file);
  }

  queueIsWorking = false;
}

/**
 * Starts the jobs defined in `jobs.json` for the given `filePath`. It also
 * creates statistics for each job and adds them to the output directory as
 * `stats.txt`.
 * @param {Object} file { path: string, type: string }
 */
async function startJobs(file) {
  const filePath = file.path;
  let task;

  // Find matching task in JSON file
  let results = tasks.filter(task => task.group === file.type);
  if (results && results.length > 0) {
    task = results[0];
  } else {
    throw new Error('No matching task found');
  }

  const relativePath = path.relative(WATCH_DIRECTORY, filePath)
  const subfolders = path.dirname(relativePath);
  const extension = path.extname(filePath);
  const fileName = path.basename(filePath, extension);  

  for (let job of task.jobs) {
    // create directory in output folder with the same name as the file
    let outDirPath = path.join(OUTPUT_DIRECTORY, job.name, subfolders);
    fs.mkdirpSync(outDirPath);

    const outFileName = `${fileName}.${job.out_ext}`;
    const outFilePath = path.join(outDirPath, outFileName);

    const command = buildCommand(task.command, {
      input: filePath,
      output: outFilePath,
      flags: job.flags,
    });

    console.log('Starting job', job.name);

    try {
      await executeCommand(command);
      console.log('Completed job', job.name);
    } catch (ex) {
      console.log('Job failed', ex);
    }
  }
};

/**
 * 
 * @param {string} template 
 * @param {object} data 
 */
function buildCommand(template, data) {
  for (let key in data) {
    if (data.hasOwnProperty(key)) {
      template = template.replace(new RegExp(`\\{\\{` + key + '\\}\\}', 'ig'), data[key]);
    }
  }
  return template;
}

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
