#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { watch, FSWatcher } from 'fs';
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { resolve, extname, relative, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { minimatch } from 'minimatch';

const execAsync = promisify(exec);

interface WatchConfig {
  target?: string;
  run?: string;
  ext?: string[];
  ignore?: string[];
  debounce?: number;
  initial?: boolean;
  config?: string;
}

function timestamp(): string {
  return chalk.dim(`[${new Date().toLocaleTimeString()}]`);
}

function loadConfig(configPath: string): Partial<WatchConfig> {
  const abs = resolve(configPath);
  if (!existsSync(abs)) {
    console.error(chalk.red(`Config file not found: ${abs}`));
    process.exit(1);
  }
  try {
    const raw = readFileSync(abs, 'utf-8');
    return JSON.parse(raw) as Partial<WatchConfig>;
  } catch {
    console.error(chalk.red(`Failed to parse config: ${abs}`));
    process.exit(1);
  }
}

function matchesIgnore(filePath: string, ignorePatterns: string[]): boolean {
  for (const pattern of ignorePatterns) {
    if (filePath.includes(pattern)) return true;
    if (minimatch(filePath, pattern)) return true;
    if (minimatch(filePath, `**/${pattern}/**`)) return true;
    if (minimatch(filePath, `**/${pattern}`)) return true;
  }
  return false;
}

function matchesExt(filePath: string, exts: string[]): boolean {
  if (exts.length === 0) return true;
  const ext = extname(filePath).replace('.', '');
  return exts.includes(ext);
}

function matchesGlob(filePath: string, pattern: string): boolean {
  if (!pattern.includes('*') && !pattern.includes('?')) return true;
  return minimatch(filePath, pattern) || minimatch(filePath, `**/${pattern}`);
}

async function runCommand(cmd: string, triggerFile?: string): Promise<void> {
  if (triggerFile) {
    console.log(
      `${timestamp()} ${chalk.cyan('→')} File changed: ${chalk.yellow(triggerFile)}`
    );
  }
  console.log(`${timestamp()} ${chalk.blue('▶')} Running: ${chalk.white(cmd)}`);

  const start = Date.now();
  try {
    const { stdout, stderr } = await execAsync(cmd, { shell: '/bin/sh' });
    const duration = Date.now() - start;
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(chalk.dim(stderr));
    console.log(
      `${timestamp()} ${chalk.green('✓')} Done in ${chalk.bold(`${duration}ms`)}`
    );
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const error = err as { stdout?: string; stderr?: string; message?: string };
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(chalk.red(error.stderr ?? ''));
    console.log(
      `${timestamp()} ${chalk.red('✗')} Failed after ${chalk.bold(`${duration}ms`)}: ${error.message ?? 'unknown error'}`
    );
  }
}

function collectPaths(target: string): string[] {
  const abs = resolve(target);
  if (!existsSync(abs)) return [];
  const stat = statSync(abs);
  if (stat.isFile()) return [abs];
  if (stat.isDirectory()) {
    const paths: string[] = [abs];
    const recurse = (dir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          paths.push(full);
          recurse(full);
        }
      }
    };
    recurse(abs);
    return paths;
  }
  return [];
}

function startWatcher(opts: WatchConfig): void {
  const {
    target = '.',
    run: cmd,
    ext = [],
    ignore = [],
    debounce: debounceMs = 300,
    initial = false,
  } = opts;

  if (!cmd) {
    console.error(chalk.red('No command specified. Use --run "command"'));
    process.exit(1);
  }

  const isGlob = target.includes('*') || target.includes('?');
  const watchTarget = isGlob ? '.' : target;
  const absTarget = resolve(watchTarget);

  const extList = Array.isArray(ext)
    ? ext
    : typeof ext === 'string'
      ? (ext as string).split(',').map((e) => e.trim())
      : [];

  const ignoreList = Array.isArray(ignore)
    ? ignore
    : typeof ignore === 'string'
      ? (ignore as string).split(',').map((i) => i.trim())
      : [];

  console.log(`${timestamp()} ${chalk.magenta('◉')} Watching: ${chalk.bold(target)}`);
  if (extList.length > 0)
    console.log(`${timestamp()} ${chalk.dim('  Extensions:')} ${extList.join(', ')}`);
  if (ignoreList.length > 0)
    console.log(`${timestamp()} ${chalk.dim('  Ignoring:')} ${ignoreList.join(', ')}`);
  console.log(`${timestamp()} ${chalk.dim('  Command:')} ${cmd}`);
  console.log(`${timestamp()} ${chalk.dim('  Debounce:')} ${debounceMs}ms`);
  console.log('');

  if (initial) {
    runCommand(cmd);
  }

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const watchers: FSWatcher[] = [];

  const handleChange = (eventType: string, filePath: string) => {
    const rel = relative(process.cwd(), filePath);

    if (matchesIgnore(rel, ignoreList)) return;
    if (!matchesExt(filePath, extList)) return;
    if (isGlob && !matchesGlob(rel, target)) return;

    const key = filePath;
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);

    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        runCommand(cmd, rel);
      }, debounceMs)
    );
  };

  const paths = collectPaths(absTarget);
  if (paths.length === 0) {
    console.error(chalk.red(`Target not found: ${absTarget}`));
    process.exit(1);
  }

  for (const p of paths) {
    try {
      const w = watch(p, { recursive: false }, (eventType, filename) => {
        if (!filename) return;
        const full = join(p, filename);
        handleChange(eventType, full);
      });
      watchers.push(w);
    } catch {
      // skip unreadable dirs
    }
  }

  const shutdown = () => {
    console.log(`\n${timestamp()} ${chalk.yellow('◉')} Stopping watcher...`);
    for (const w of watchers) w.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const program = new Command();

program
  .name('file-watch')
  .description('Watch files for changes and run commands automatically')
  .version('1.0.0')
  .argument('[target]', 'File, directory or glob pattern to watch', '.')
  .option('-r, --run <command>', 'Command to run on change')
  .option('-e, --ext <extensions>', 'Comma-separated file extensions to watch (e.g. ts,js)')
  .option('-i, --ignore <patterns>', 'Comma-separated patterns to ignore (e.g. node_modules,dist)')
  .option('-d, --debounce <ms>', 'Debounce delay in milliseconds', '300')
  .option('--initial', 'Run command once immediately on start')
  .option('-c, --config <file>', 'Load options from a JSON config file')
  .action((target: string, cliOpts: Record<string, string | boolean>) => {
    let opts: WatchConfig = {};

    if (cliOpts['config']) {
      const fromFile = loadConfig(cliOpts['config'] as string);
      opts = { ...fromFile };
    }

    if (target && target !== '.') opts.target = target;
    if (cliOpts['run']) opts.run = cliOpts['run'] as string;
    if (cliOpts['ext'])
      opts.ext = (cliOpts['ext'] as string).split(',').map((e) => e.trim());
    if (cliOpts['ignore'])
      opts.ignore = (cliOpts['ignore'] as string).split(',').map((i) => i.trim());
    if (cliOpts['debounce'])
      opts.debounce = parseInt(cliOpts['debounce'] as string, 10);
    if (cliOpts['initial']) opts.initial = true;

    startWatcher(opts);
  });

program.parse(process.argv);
