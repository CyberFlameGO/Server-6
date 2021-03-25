import IORedis from 'ioredis';
import { BehaviorSubject } from 'rxjs';
import { Config } from 'src/Config';

export class Redis extends IORedis {
	private static instance: Redis;
	static Get(): Redis {
		return this.instance ?? (this.instance = new Redis());
	}

	connected = new BehaviorSubject<boolean>(false);

	constructor() {
		super(Config.redis_port as number ?? 6979, Config.redis_hostname ?? 'localhost', {

		});

		this.once('connect', () => this.connected.next(true));
	}
}

export namespace Redis {
	export enum Key {
		Role = 'roles'
	}
}
