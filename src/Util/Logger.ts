import chalk from 'chalk';
import util from 'util';
import fs from 'fs';
import { Subject } from 'rxjs';
import { format } from 'date-fns';

const ctx = new chalk.Instance({ level: 3 });
export class Logger {
	private static instance: Logger;
	static Get(): Logger {
		return this.instance ?? (this.instance = new Logger());
	}

	logCreated = new Subject<Logger.Log>();
	private stream: fs.WriteStream | undefined;

	levels = {
		trace: false,
		debug: true,
		info: true,
		important: true,
		warn: true,
		error: true,
		critical: true
	};

	constructor(public options: Logger.Options = {}) {
		// If parent is set, inherit the levels
		if (options.parent) {
			this.levels = options.parent.levels;
		}
	}

	/**
	 * Return a string that represents a formatted date for timestamping logs
	 *
	 * @param hourOnly Whether to only return hours
	 */
	private getTimestamp(hourOnly: boolean = false): string {
		let ms = String(new Date().getMilliseconds());
		for (let index = ms.length; index < 3; ++index) { ms = '0'.concat(ms); }

		let time = format(new Date(), hourOnly ? `pp` : `Ppp`) + `.${ms}`;

		return time;
	}

	private writeJSON(level: Logger.LevelName, message: string, ...args: any[]): void {
		const log = <Logger.Log>{
			logger: this.options.name,
			level: Logger.Level[level],
			message: util.format(message, ...args),
			extra: args.length > 0 ? [...args.map(a => util.format(a))] : undefined
		};
		if (this.options.prefix) log.prefix = this.options.prefix;

		this.logCreated.next(log);
		return undefined;
	}

	private writeShell(level: string, levelBracketColor: chalk.Chalk, ...args: any) {
		const timestampColor = chalk.keyword('gray');
		const timestamp = `${(timestampColor(this.getTimestamp(true)))}`;

		process.stdout.write(util.format(
			`${timestamp} ${levelBracketColor('[')}${level}${levelBracketColor(']')}`,
			this.options.prefix ? String(this.options.prefix) : '',
			`${this.options.name ? `<${chalk.magentaBright(this.options.name)}>` : ''}`,
			...args,
			'\n'
		));
	}

	private writeFile(level: string, ...args: any): void {
		const timestamp = this.getTimestamp();
		this.stream = this.stream ? this.stream : this.getWriteStream();

		if (!this.stream) return undefined;
		this.stream.write(util.format(chalk.reset(`${timestamp} [${level}]:`, ...args, '\n')));
		return undefined;
	}

	private getWriteStream(): fs.WriteStream {
		if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');
		const now = format(new Date(), `p`);
		const today = format(new Date(), `yyyy-MM-dd`);
		let stream: fs.WriteStream;
		stream = fs.createWriteStream(`./logs/${today}`, { encoding: 'utf8', flags: 'a' });
		stream.write(`\n--- ${today} ${now} ---\n\n`);

		return stream;
	}

	trace(message: string, ...args: any) {
		if (!this.levels.trace) return undefined;
		this.writeJSON('TRACE', message, ...args);
		this.writeShell(ctx.gray('TRACE'), ctx.gray, message ? ctx.gray(message) : '', ...args);
		this.writeFile('TRACE', message, ...args);

	}

	debug(message: string, ...args: any) {
		if (!this.levels.debug) return undefined;
		this.writeJSON('DEBUG', message, ...args);
		this.writeShell(ctx.cyan('DEBUG'), ctx.gray, message ? ctx.gray(message) : '', ...args);
		this.writeFile('DEBUG', message, ...args);
	}

	info(message: string, ...args: any) {
		if (!this.levels.info) return undefined;
		this.writeJSON('INFO', message, ...args);
		this.writeShell(ctx.green('INFO'), ctx.cyan, message ? message : '', ...args);
		this.writeFile('INFO', message, ...args);
	}

	important(message: string, ...args: any) {
		if (!this.levels.important) return undefined;
		this.writeJSON('IMPORTANT', message, ...args);
		this.writeShell(ctx.bgGreenBright('IMPORTANT'), ctx.black.green, message ? `${chalk.bgCyan.black.bold(message)}` : '', ...args);
		this.writeFile('', message, ...args);
	}

	warn(message: string, ...args: any) {
		if (!this.levels.warn) return undefined;
		this.writeJSON('WARN', message, ...args);
		this.writeShell(ctx.yellowBright('WARN'), ctx.yellow, message ? ctx.yellow(message) : '', ...args);
		this.writeFile('WARN', message, ...args);
	}

	error(message: string, ...args: any) {
		if (!this.levels.error) return undefined;
		this.writeJSON('ERROR', message, ...args);
		this.writeShell(ctx.bgRed('ERROR'), ctx.yellowBright, message ? ctx.red(message) : '', ...args);
		this.writeFile('ERROR', message, ...args);
	}

	critical(message: string, ...args: any) {
		if (!this.levels.critical) return undefined;
		this.writeJSON('CRITICAL', message, ...args);
		this.writeShell(ctx.bgRedBright('CRITICAL'), ctx.red, message ? ctx.bgRed(message) : '', ...args);
		this.writeFile('CRITICAL', message, ...args);
	}

}

export namespace Logger {
	export interface Options {
		/** the name of this logger */
		name?: string;
		/** the parent logger for this logger */
		parent?: Logger;
		/** whether this is the client logger. this should not be set manually */
		isClientLogger?: boolean;
		/** optional prefix for the logger */
		prefix?: string;
		hook?: HookFunction;
	}

	export enum Level {
		TRACE = 0,
		DEBUG = 1,
		INFO = 2,
		IMPORTANT = 3,
		WARN = 4,
		ERROR = 5,
		CRITICAL = 6
	}
	export type LevelName = keyof typeof Level;

	export type HookFunction = () => void;

	/**
	 * A JSON Log Item
	 */
	export interface Log {
		/** the name of the logger which wrote this log */
		logger: string;
		/** the severity/level of this log */
		level: Level;
		/** the message this log writes */
		message: string;
		/** the prefix of the logger which wrote this log */
		prefix?: string;
		/** objects embedded into this log */
		extra?: string[];
	}
}
