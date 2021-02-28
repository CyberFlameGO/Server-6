import { readdirSync, existsSync, rmdirSync } from 'fs';
import {} from 'rxjs';
import {} from 'rxjs/operators';
import { Config } from 'src/Config';
import { Mongo } from 'src/Db/Mongo';

import('src/Client/Client');

if (existsSync('tmp/')) {
	for (const dir of readdirSync('tmp/')) {
		rmdirSync(`tmp/${dir}`, { recursive: true });
	}
}

new Mongo();

// Import config nodes from environment?
{
	const keys = Object.keys(process.env).filter(k => k.startsWith('cfg_'));
	for (const k of keys) {
		const qualifiedKey = k.replace('cfg_', '');
		console.log(k, qualifiedKey);
		(Config as any)[qualifiedKey] = process.env[k];
	}
}
