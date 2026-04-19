import chalk from 'chalk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const colors = {
  title: chalk.hex('#8B4513'),
  subtitle: chalk.hex('#C4A87C'),
  accent: chalk.hex('#D2691E'),
  text: chalk.hex('#DDD5C7'),
  muted: chalk.hex('#8B8178'),
  success: chalk.hex('#6B8E23'),
  error: chalk.hex('#CD5C5C'),
  dim: chalk.hex('#6B6358'),
};

export function getBannerText() {
  try {
    return readFileSync(resolve(__dirname, '..', 'aristotle.txt'), 'utf-8');
  } catch {
    return '';
  }
}

export function printBanner(topic) {
  const banner = getBannerText();
  if (banner) {
    console.log(colors.subtitle(banner));
  }

  console.log(colors.title('  A R I S T O T L E'));
  console.log(colors.muted('  Understand everything.\n'));

  if (topic) {
    console.log(colors.text(`  Topic: ${colors.accent(topic)}\n`));
  }
}

export function printHelp() {
  printBanner();
  console.log(colors.text('  Usage: aristotle <topic>\n'));
  console.log(colors.muted('  Examples:'));
  console.log(colors.muted('    aristotle "machine learning"'));
  console.log(colors.muted('    aristotle "quantum mechanics"'));
  console.log(colors.muted('    aristotle "music theory"\n'));
}
