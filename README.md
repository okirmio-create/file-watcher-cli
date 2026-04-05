# file-watcher-cli

Watch files for changes and run commands automatically.

## Installation

```bash
npm install -g file-watcher-cli
```

Or use without installing:

```bash
npx file-watcher-cli ./src --run "npm test"
```

## Usage

```bash
file-watch [target] [options]
```

### Options

| Option | Description |
|---|---|
| `-r, --run <command>` | Command to run on change |
| `-e, --ext <extensions>` | Comma-separated extensions to watch (e.g. `ts,js`) |
| `-i, --ignore <patterns>` | Comma-separated patterns to ignore |
| `-d, --debounce <ms>` | Debounce delay in milliseconds (default: 300) |
| `--initial` | Run command once immediately on start |
| `-c, --config <file>` | Load options from a JSON config file |

## Examples

Watch a directory and run tests on change:

```bash
file-watch ./src --run "npm test"
```

Watch a glob pattern:

```bash
file-watch "*.ts" --run "npm run build"
```

Filter by extension:

```bash
file-watch --ext ts,js --run "npm test"
```

Ignore patterns:

```bash
file-watch --ignore node_modules,dist --run "npm run lint"
```

Custom debounce:

```bash
file-watch --debounce 500 --run "npm test"
```

Run command once on start, then on each change:

```bash
file-watch ./src --initial --run "npm run build"
```

## Config File

You can load options from a JSON file:

```bash
file-watch --config watch.json
```

Example `watch.json`:

```json
{
  "target": "./src",
  "run": "npm test",
  "ext": ["ts", "js"],
  "ignore": ["node_modules", "dist"],
  "debounce": 300,
  "initial": true
}
```

## Output

- Timestamps on every log line
- Shows which file triggered the run
- Shows command duration and success/failure status
- Colorized output via chalk

## Requirements

- Node.js >= 18.0.0
- Uses built-in `fs.watch` — no extra dependencies for file watching

## License

MIT — okirmio-create
