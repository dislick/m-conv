const chokidar = require('chokidar');
const fs = require('fs-extra');
const exec = require('child_process').exec;
const path = require('path');
const tasks = require('../m-conv-tasks.json').tasks;

/**
 * Environment Variables
 *
 * When declaring the WATCH and OUTPUT directory env variables make sure to use
 * relative paths. Oh and you know, don't create an infinite loop by having the
 * output dir inside the input dir.
 */
const WATCH_DIRECTORY = path.resolve(
  process.env.CONVERT_WATCH_DIR || './input'
);
const OUTPUT_DIRECTORY = path.resolve(
  process.env.CONVERT_OUT_DIR || './output'
);

/**
 * The main reason that we are printing the directory variables is so that the
 * user immediately recognizes if he/she made a mistake when configuring the
 * environment variables.
 */
console.log('Initializing...');
console.log('WATCH_DIRECTORY', WATCH_DIRECTORY);
console.log('OUTPUT_DIRECTORY', OUTPUT_DIRECTORY);

/**
 * Start watching the WATCH_DIRECTORY for changes. It ignores dot-files and
 * files that are already in the directory. Thanks to `awaitWriteFinish`
 * chokidar waites until files are fully copied to the directory before firing
 * the `add` event. If it's not reliable for you, try increasing the
 * `stabilityThreshold` value.
 */
const watcher = chokidar.watch(WATCH_DIRECTORY, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 3000,
    pollInterval: 100,
  },
});

/**
 * Here we are declaring a file queue. Since most tools like ffmpeg or
 * imagemagick handle their threads accoring to how many CPU cores a system has,
 * we will only process one file at a time.
 */
let fileQueue = []; // { path: string, type: string }[]
let queueIsWorking = false;

watcher.on('add', filePath => {
  let extension = path.extname(filePath);

  for (let task of tasks) {
    // Check if the extension of the file matches with one of the extensions
    // declared in the config.
    let extensionRegex = new RegExp(`\.(${task.matched_ext.join('|')})`, 'i');

    if (extensionRegex.test(extension)) {
      fileQueue.push({
        path: filePath,
        type: task.group,
      });
    }
  }

  if (!queueIsWorking) {
    startQueue();
  }
});

async function startQueue() {
  queueIsWorking = true;

  while (fileQueue.length > 0) {
    let file = fileQueue.pop();
    await startJobs(file);
  }

  queueIsWorking = false;
}

/**
 * Starts the jobs defined in the configuration file for the given `file`.
 * @param {Object} file { path: string, type: string }
 */
async function startJobs(file) {
  // Find matching task in JSON file
  const results = tasks.filter(task => task.group === file.type);
  if (results.length <= 0) {
    throw new Error('No matching task found');
  }
  const task = results[0];

  const subfolders = path.dirname(path.relative(WATCH_DIRECTORY, file.path));
  const fileName = path.basename(file.path, path.extname(file.path));

  for (let job of task.jobs) {
    const outDirPath = path.join(OUTPUT_DIRECTORY, job.name, subfolders);
    const outFilePath = path.join(outDirPath, `${fileName}.${job.out_ext}`);

    // Create the necessary folders if they don't exist in the output dir
    fs.mkdirpSync(outDirPath);

    const command = buildCommand(task.command, {
      input: file.path,
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
}

/**
 * Templating function for commands. Any key you pass in `data` can be used as a
 * simple template variable by placing it between {{ }}.
 * @param {string} template
 * @param {object} data
 */
function buildCommand(template, data) {
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      template = template.replace(
        new RegExp(`\\{\\{` + key + '\\}\\}', 'ig'),
        data[key]
      );
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
