import { readdirSync, existsSync, rmdirSync } from 'fs';
import {} from 'rxjs';
import {} from 'rxjs/operators';
import { Mongo } from 'src/Db/Mongo';

import('src/Client/Client');

if (existsSync('tmp/')) {
	for (const dir of readdirSync('tmp/')) {
		rmdirSync(`tmp/${dir}`, { recursive: true });
	}
}

new Mongo();
