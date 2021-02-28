import { readdirSync, existsSync, writeFileSync, rmdirSync } from 'fs';
import { noop } from 'rxjs';
import {} from 'rxjs/operators';

if (existsSync('tmp/')) {
	for (const dir of readdirSync('tmp/')) {
		rmdirSync(`tmp/${dir}`, { recursive: true });
	}
}


!existsSync('config.json')
	? writeFileSync('config.json', '{}', 'utf8')
	: noop();
import { Config } from 'src/Config';
// Import config nodes from environment?
{
	const keys = Object.keys(process.env).filter(k => k.startsWith('cfg_'));
	for (const k of keys) {
		const qualifiedKey = k.replace('cfg_', '');
		console.log(k, qualifiedKey);
		(Config as any)[qualifiedKey] = process.env[k];
	}
}

import { Mongo } from 'src/Db/Mongo';
import { HttpListener } from 'src/API/HttpListener';
new Mongo();
new HttpListener().listen();
