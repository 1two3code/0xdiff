#!/bin/sh
':' //; exec /usr/bin/env node --no-warnings "$0" "$@"

import { existsSync, statSync, unlinkSync, createReadStream, createWriteStream } from 'node:fs';
import { exec } from 'node:child_process';
import { Transform } from 'node:stream';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import packageJson from './package.json' assert { type: 'json' };
const { name, description, version } = packageJson;

const usage =
`
${name} ${version}
${description}

Usage: ${name} [options] <file> <file>

Options
  -b --bytes-per-row <bytes>                        [1, 2, 4, (8), 16, 32, 64].
  -s --max-size <size>                              MB max file size for compare (1).
  -k --keep                                         Do not discard temp files on exit.
  -d --debug <Double|Float|(Big)(U)Int(16|32|64)>   Displays value for each hex row.
  -e --endianness <l | little | b | big>            Only used with -d (little)
  -h --help                                         Display this help text.
`;

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(usage);
  process.exit(1);
}

const formats = [
  'BigInt64',
  'BigUInt64',
  'Double',
  'Float',
  'Int16',
  'Int32',
  'UInt16',
  'UInt32',
];

let file1 = '';
let file2 = '';
let bytesPerRow = 8;
let maxSize = 1;
let endianness = 'LE'
let debugFormat = '';
let keep = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {    
    case '--bytes-per-row':
    case '-b':
      const num = Number(args[++i]);
      if ([1, 2, 4, 8, 16, 32, 64].includes(num)) {
        bytesPerRow = num;
      } else {
        console.error('Error: bytes-per-row accepts only pow2 numbers up to 64.');
        process.exit(1);
      }
      break;
      
    case '--endianness':
    case '-e':
      const value = args[++i];
      if (['big', 'b', 'little', 'l'].includes(value)) {
        endianness = (value === 'big' || value === 'b') ? 'BE' : 'LE';
      } else {
        console.error(`Error: Invalid value for endianness. Accepts only 'big', 'b', 'little', or 'l'.`);
        process.exit(1);
      }
      break;

    case '--debug':
    case '-d':
      const readFormat = args[++i];
      if (formats.includes(readFormat)) {
        debugFormat = readFormat;
      } else {
        console.error(`Error: Invalid value for --debug. (use one of. ${formats.join(',')})`);
        process.exit(1);
      }
      break;

    case '--max-size':
    case '-s':
      const size = Number(args[++i]);
      maxSize = size
      if (size > 0) {
        maxSize = size;
      } else {
        console.erro('Error: max-size > 0');
        process.exit(1);
      }
      if (size > 4) {
        console.warn(`Warn: max-size > 4 might crash vscode. Use with caution.`);
      }
      break;

    case '--keep':
    case '-k':
      keep = true;
      break;

    case '--help':
    case '-h':
      const {
        name,
        version
      } = await import('./package.json')
      console.log(usage);
      break;
    
    default:
      if (file1 === '') {
        file1 = args[i];
      } else {
        file2 = args[i];
      }
      
      if (!existsSync(args[i])) {
        console.error(`Error: File ${args[i]} does not exist.`);
        process.exit(1);
      } else {
        const fileStat = statSync(args[i]);
        if (fileStat.size / (1024*1024) > maxSize) {
          console.error(`Error: File ${args[i]} size > ${maxSize}MB`);
          process.exit(1);
        }
      }
      
  }
}

const timestamp = `${Date.now()}`.slice(-4);
const tempDir = tmpdir();
const tempFile1 = join(tempDir, `${basename(file1, extname(file1))}-0xdiff1-${timestamp}`);
const tempFile2 = join(tempDir, `${basename(file2, extname(file2))}-0xdiff2-${timestamp}`);

const maxBits = bytesPerRow * 8;
const numDebugBits = debugFormat === 'Double' 
  ? 64 
  :parseInt((debugFormat.match(/\d{2}/) || ['32'])[0], 10);

if (numDebugBits > maxBits) {
  console.error(`Error: Format ${debugFormat} exceeds ${maxBits} bits.`);
  process.exit(1);
}

const bufferReadFunction = `read${debugFormat}${endianness}`;

const file1WriteStream = createWriteStream(tempFile1);
const file2WriteStream = createWriteStream(tempFile2);

function toHex(chunk, encoding, callback) {
  this.push(`${[...chunk].map(c => c.toString(16).padStart(2, '0').toUpperCase()).join(' ')}\n`);
  callback();
}

function toHexWithDebug(chunk, encoding, callback) {
  this.push([...chunk].map(c => c.toString(16).padStart(2, '0').toUpperCase()).join(' '));
  try {
    this.push(`   # ${chunk[bufferReadFunction]()}\n`)
  } catch(err) {/* last line might not have enough bytes */}
  callback();
}

const transform = debugFormat && endianness ? toHexWithDebug : toHex;
createReadStream(file1, { highWaterMark: bytesPerRow })
  .pipe(new Transform({ transform }))
  .pipe(file1WriteStream);
createReadStream(file2, { highWaterMark: bytesPerRow })
  .pipe(new Transform({ transform }))
  .pipe(file2WriteStream);

let vscodeProcess;
function cleanAndExit(code) {
  if (code !==0 ) {
    console.log('Close the diff window to terminate.')
    vscodeProcess?.kill()
  }
}

try {
  await Promise.allSettled([
    new Promise(resolve => file1WriteStream.on('finish', resolve)),
    new Promise(resolve => file2WriteStream.on('finish', resolve))
  ]);
  file1WriteStream.on('error', (err) => {throw err});
  file2WriteStream.on('error', (err) => {throw err});

  const vscodeCommand = 'code --wait --diff';
  const subProcess = `${vscodeCommand} ${tempFile1} ${tempFile2}`;
  vscodeProcess = exec(subProcess, (err) => {
    if (!keep) {
      console.log('Cleaning up temp files and exiting.');
      unlinkSync(tempFile1);
      unlinkSync(tempFile2);
    } else {
      console.log(`Files kept\n${tempFile1}\n${tempFile2}`)
    }
    if (err && !err?.killed) {
      throw err;
    }
  });
  
  console.log(`Started \`${vscodeCommand}\` (${vscodeProcess.pid})`);

} catch (err) {
  console.error(err);
}

process.on('SIGINT', cleanAndExit);
process.on('SIGTERM', cleanAndExit);