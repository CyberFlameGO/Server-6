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

import { Mongo } from 'src/Db/Mongo';
import { HttpListener } from 'src/API/HttpListener';
new Mongo();
new HttpListener().listen();
