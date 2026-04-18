import chalk from 'chalk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Warm earth tones
export const colors = {
  title:    chalk.hex('#8B4513'),       // saddle brown
  subtitle: chalk.hex('#C4A87C'),       // warm tan
  accent:   chalk.hex('#D2691E'),       // chocolate
  text:     chalk.hex('#DDD5C7'),       // warm white
  muted:    chalk.hex('#8B8178'),       // warm gray
  success:  chalk.hex('#6B8E23'),       // olive green
  error:    chalk.hex('#CD5C5C'),       // indian red
  dim:      chalk.hex('#6B6358'),       // dark warm gray
};

function loadAsciiArt() {
  try {
    const art = readFileSync(resolve(__dirname, '..', 'aristotle.txt'), 'utf-8');
    return colors.subtitle(art);
  } catch {
    return '';
  }
}

const ARISTOTLE = loadAsciiArt();

export function banner(topic) {
  console.log(ARISTOTLE);
  console.log(colors.title('  A R I S T O T L E'));
  console.log(colors.muted('  Learn everything.\n'));
  if (topic) {
    console.log(colors.text(`  Topic: ${colors.accent(topic)}\n`));
  }
}

export function step(label) {
  console.log(colors.accent(`\n▸ ${label}`));
}

export function info(msg) {
  console.log(colors.muted(`  ${msg}`));
}

export function success(msg) {
  console.log(colors.success(`  ${msg}`));
}

export function error(msg) {
  console.error(colors.error(`  ${msg}`));
}

export function statusLine(msg) {
  process.stdout.write(colors.dim(`\r  ${msg.padEnd(60)}\r`));
}
