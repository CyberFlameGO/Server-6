import { bindEagerlyTo, combineRoutes, createContextToken, createServer, httpListener, HttpMiddlewareEffect, HttpServerEffect, matchEvent, ServerEvent } from '@marblejs/core';
import { logger$ } from '@marblejs/middleware-logger';
import { bodyParser$ } from '@marblejs/middleware-body';
import { webSocketListener, mapToServer, WebSocketServerConnection, createWebSocketServer } from '@marblejs/websockets';
import { cors$ } from '@marblejs/middleware-cors';
import { Config } from 'src/Config';
import { merge } from 'rxjs';
import { HttpEffects, WSEffects } from 'src/API/EffectIndex';

export class HttpListener {
	setMiddlewares(): HttpMiddlewareEffect[] {
		return [ // Set global server mdidlewares
			logger$({}),
			bodyParser$({}),
			cors$({ // Define CORS rules
				origin: '*',
				withCredentials: false,
				allowHeaders: '*',
				methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
			})
		];
	}

	listen(): this {
		// Create HttpListener
		const listener = httpListener({
			middlewares: this.setMiddlewares(),
			effects: [
				combineRoutes('/v1', [ ...HttpEffects ]),
				...HttpEffects
			]
		});

		// Make a context token to bind the websocket server to port 80
		const WebSocketServerToken = createContextToken<WebSocketServerConnection>('VeryPog');
		const wsServer = createWebSocketServer({ // Create new websocket server
			listener: webSocketListener({
				effects: [ ...WSEffects ]
			})
		});

		// Define the upgrade effect for upgrading HTTP requests to the WS protocol
		const upgrade$: HttpServerEffect = (event$, ctx) =>
			event$.pipe(
				matchEvent(ServerEvent.upgrade),
				mapToServer({
					path: '/',
					server: ctx.ask(WebSocketServerToken),
				}),
			);
		createServer({
			port: Config.port,
			hostname: Config.hostname,
			listener,
			dependencies: [ // Bind WS server
				bindEagerlyTo(WebSocketServerToken)(async () => await (await wsServer)())
			],
			event$: (...args) => merge( // Upgrade requests
				upgrade$(...args),
			),
		}).then(server => server()); // Start listening

		return this;
	}
}
