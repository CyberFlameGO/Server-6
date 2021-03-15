import path from 'path';
import { fromEvent, Observable } from 'rxjs';

export namespace Constants {
	export const TWITCH_API_BASE = `https://api.twitch.tv`;

	export const APP_ROOT = path.resolve(__dirname + '/../..');
	export const WORKER_BOOTSTRAP_PATH = path.resolve(__dirname + '/../../worker_bootstrap.js');
	export interface TaggedWorkerMessage<TAG, D> {
		tag: TAG;
		data: D;
	}
}
