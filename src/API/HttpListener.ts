import { createServer, httpListener, HttpMiddlewareEffect, r } from '@marblejs/core';
import { logger$ } from '@marblejs/middleware-logger';
import { bodyParser$ } from '@marblejs/middleware-body';
import { RootRoute } from 'src/API/Routes/RootRoute';
import { EmotesRoute } from 'src/API/Routes/EmotesRoute';
import { AuthRoute } from 'src/API/Routes/AuthRoute';
import { cors$ } from '@marblejs/middleware-cors';
import { UsersRoute } from 'src/API/Routes/UsersRoute';
import { Config } from 'src/Config';
import { authorize$ } from '@marblejs/middleware-jwt';
import { of } from 'fp-ts/lib/Option';
import { toRecord } from 'fp-ts/lib/ReadonlyRecord';

export class HttpListener {
	setMiddlewares(): HttpMiddlewareEffect[] {
		return [
			logger$({}),
			bodyParser$({}),
			cors$({
				origin: '*',
				allowHeaders: '*',
				methods: ['GET', 'POST', 'PUT', 'PATCH']
			})
		];
	}

	listen(): void {
		const listener = httpListener({
			middlewares: this.setMiddlewares(),
			effects: [
				RootRoute,
				EmotesRoute,
				AuthRoute,
				UsersRoute
			]
		});

		const server = createServer({
			port: Config.port,
			hostname: Config.hostname,
			listener
		});

		const main = async () => await (await server)();
		main();
	}
}
