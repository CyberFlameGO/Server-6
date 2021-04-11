import { readdirSync, existsSync, writeFileSync, rmdirSync } from 'fs';
import { noop } from 'rxjs';
import { isMainThread } from 'worker_threads';

import { Mongo } from 'src/Db/Mongo';
import { HttpListener } from 'src/API/HttpListener';
import { Logger } from 'src/Util/Logger';

if (isMainThread) {
	if (existsSync('tmp/')) {
		for (const dir of readdirSync('tmp/')) {
			rmdirSync(`tmp/${dir}`, { recursive: true });
		}
	}


	!existsSync('config.json')
		? writeFileSync('config.json', '{}', 'utf8')
		: noop();

	new HttpListener().listen();
	new Mongo();
}

// Kubernetes environment;
// StatefulSet setup
//
// Get ordinal index from Pod
let setPodOrdinal: number | null = null;
export const POD_ORDINAL = () => process.env.POD_NAME
	? setPodOrdinal ?? (setPodOrdinal = Number(process.env.POD_NAME?.match(/(\d+)(?!.*\d)/)?.[0]))
	: null;

if (typeof POD_ORDINAL() === 'number') {
	Logger.Get().info(`<k8s> Kubernetes mode enabled because Pod Ordinal was found in the environment.`);
	Logger.Get().info(`<k8s> Container identified as ordinal ${POD_ORDINAL()}`);
}
