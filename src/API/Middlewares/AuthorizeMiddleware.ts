import { API } from '@typings/typings/API';
import { defer, iif, Observable, of, throwError } from 'rxjs';
import { Config } from 'src/Config';
import { catchError, map, switchMap } from 'rxjs/operators';
import { HttpMiddlewareEffect, HttpRequest } from '@marblejs/core';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { TwitchUser } from 'src/Util/TwitchUser';
import { Mongo } from 'src/Db/Mongo';

type WithUserGetter = { getUser: Observable<TwitchUser> };
export type WithUser = {
	user?: API.TokenPayload & WithUserGetter;
};

/**
 * Middleware: Authorize
 *
 * Authenticates a request and adds the JWT payload and an observable to fetch the full user
 * under req.user when successful
 *
 * @param optional If true, the request will not be rejected if the end user is unauthenticated
 */
export const AuthorizeMiddleware = (optional = false): HttpMiddlewareEffect<HttpRequest> => (req$: Observable<HttpRequest>) =>
	req$.pipe(
		switchMap(req => iif(() => typeof req.headers.authorization === 'string' && req.headers.authorization.length > 0,
			of(req).pipe(
				map(req => req.headers.authorization?.split('Bearer ')[1]),
				map(token  => jwt.verify(token as string, Config.jwt_secret) as API.TokenPayload),
				catchError(err => req.response.send({ status: 401, body: { error: err } })),
				map((token: API.TokenPayload) => {
					const id = ObjectId.createFromHexString(String(token.id));
					req.user = {
						...token,
						id,
						getUser: Mongo.Get().collection('users').pipe( // Create user getter
							switchMap(col => col.findOne({ _id: id  })),
							switchMap(data => !!data ? of(data) : throwError(Error('Unknown User'))),
							map(data => new TwitchUser(data))
						)
					} as API.TokenPayload & WithUserGetter;

					return req;
				})
			),
			optional ? of(req) : defer(() => req.response.send({ status: 401, body: { error: 'Authorization Required' } })),
		)),

		map(req => req as HttpRequest & WithUser)
	);
