# 0xdiff

## Install
`npm i -g 0xdiff`

## Usage
```
0xdiff 1.0.0
Converts bin file to diffable text and starts `code --diff`

Usage: 0xdiff [options] <file> <file>

Options
  -b --bytes-per-row <bytes>                        [1, 2, 4, (8), 16, 32, 64].
  -s --max-size <size>                              MB max file size for compare(1).
  -k --keep                                         Do not discard temp files on exit.
  -d --debug <Double|Float|(Big)(U)Int(16|32|64)>   Displays value for each hex row.
  -e --endianness <l | little | b | big>            Only used with -d (little)
  -h --help                                         Display this help text.
```
