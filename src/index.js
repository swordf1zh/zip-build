#!/usr/bin/env node
const fs = require('fs');
const zipFolderPromise = require('zip-folder-promise');
const inquirer = require('inquirer');
const yargs = require('yargs/yargs');
const { generateFilename } = require('./generateFilename.js');

const CWD = process.cwd();
const PACKAGE = require(`${CWD}/package.json`);

const { hideBin } = require('yargs/helpers')

let _format;
let _template;
let _askFilename;

yargs(hideBin(process.argv))
  .command(
    '$0 [build-dir] [zip-dir] [options]',
    'Zip your <build-dir> directory into <zip-dir>',
    (yargs) => {
      yargs
        .usage('Usage: $0 <build-dir> <zip-dir> [options]')
        .positional('build-dir', {
          describe: 'Directory of your build output',
          default: 'build'
        })
        .positional('zip-dir', {
          describe: 'Directory for your zipped backup',
          default: 'dist'
        })
        .option('f', {
          alias: 'format',
          type: 'string',
          description: 'Format of output file',
          choices: [
            'zip',
            'tar',
          ],
          default: 'zip',
        })
        .option('n', {
          alias: 'name',
          type: 'boolean',
          description: 'Ask for output archive filename',
          default: false,
        })
        .option('t', {
          alias: 'template',
          type: 'string',
          description: 'Template for output archive filename',
          default: '%NAME%_%VERSION%.%EXT%',
        })
        .example('$0', "Zip 'build' directory and put archive under dist directory.")
        .example('$0 out backup', "Zip 'out' directory and put archive under backup directory.")
    },
    (argv) => {
      const { buildDir, zipDir, format, name, template } = argv;
      _format = format;
      _template = template;
      _askFilename = name;

      init(buildDir, zipDir)
        .catch(err => console.log(err));
    }
  )
  .help('h')
  .alias('h', 'help')
  .argv;

async function confirmAsync(message, _default = true) {
  const questions = [{
    type: 'confirm',
    name: 'qname',
    message,
    default: _default,
  }];

  const answerObj = await inquirer.prompt(questions);
  return answerObj.qname;
}

async function setBackupName(dstdir, filename) {
  const OUTPATH = `${CWD}/${dstdir}`;
  const URI = `${OUTPATH}/${filename}`;

  if (! fs.existsSync(URI)) return filename;

  const choices = [
    'Overwrite existing file',
    'Rename output file appending the current timestamp',
    'Rename output file with another name',
    'Exit'
  ];

  const MSG = `The file '${filename}' already exists in directory `
    + `'${dstdir}'.. What do you want to do?`
  const ANS = await inquirer.prompt([{
    type: 'list',
    name: 'qname',
    message: MSG,
    choices,
  }]);

  switch (ANS.qname) {
    case choices[0]:
      return filename;

    case choices[1]:
      filename = filename.replace(/(\.[\w\d_-]+)$/i, `_${Date.now()}$1`);
      return await setBackupName(dstdir, filename);

    case choices[2]:
      const ANS_REN = await inquirer.prompt([{
        type: 'input',
        name: 'filename',
        message: 'New name for your file:',
      }]);
      return await setBackupName(dstdir, `${ANS_REN.filename}.${_format}`);

    default:
      console.log('Bye!');
      process.exit(1);
  }
}

async function init(srcdir = 'build', dstdir = 'dist') {
  const BUILDPATH = `${CWD}/${srcdir}`;
  const OUTPATH = `${CWD}/${dstdir}`;

  if (!fs.existsSync(BUILDPATH)) {
    console.log(`There is no directory with the name '${srcdir}' in your project.`);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPATH)) {
    const mkdirMsg = `There is no directory with the name '${dstdir}'. Do you want to create it?`;
    if (await confirmAsync(mkdirMsg)) {
      fs.mkdirSync(OUTPATH);
      console.log(`'${dstdir}' created!`);

      const gitIgMsg = `Do you want to include '${dstdir}' in your .gitignore?`;
      if (await confirmAsync(gitIgMsg)) {
        console.log(`Done!`);
        fs.appendFileSync(`${CWD}/.gitignore`, `\n${dstdir}`);
      }
    } else {
      console.log('Bye!');
      process.exit(1);
    }
  }

  let outfileName = generateFilename(_template, _format);
  if (_askFilename) {
    const ANS_NAME = await inquirer.prompt([{
      type: 'input',
      name: 'filename',
      message: 'Set output filename (including extension):',
    }]);

    if (ANS_NAME.filename) outfileName = ANS_NAME.filename;
  }

  const OUTFILE = await setBackupName(dstdir, outfileName);
  const OUTURI = `${OUTPATH}/${OUTFILE}`;

  const resMsg = await zipFolderPromise(BUILDPATH, OUTURI, _format);

  console.log(`${resMsg} to ${dstdir}/${OUTFILE}`);
}