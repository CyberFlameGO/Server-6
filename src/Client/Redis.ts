import IORedis from 'ioredis';
import { Config } from 'src/Config';

export class Redis extends IORedis {
	private static instance: Redis;
	static Get(): Redis {
		return this.instance ?? (new Redis());
	}

	constructor() {
		super(Config.redis_port as number ?? 6979, Config.redis_hostname ?? 'localhost', {

		});
	}
}

export namespace Redis {
	export enum Key {
		Role = 'roles'
	}
}
