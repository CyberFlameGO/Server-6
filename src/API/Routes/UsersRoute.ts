import { combineRoutes, HttpRequest, r } from '@marblejs/core';
import { authorize$ } from '@marblejs/middleware-jwt';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Mongo } from 'src/Db/Mongo';
import { Config } from 'src/Config';
import { ObjectId } from 'bson';
import { API } from '@typings/API';

const GetCurrentUserRoute = r.pipe(
	r.matchPath('/@me'),
	r.matchType('GET'),
	r.use(authorize$({
		secret: Config.jwt_secret
	}, (payload: API.TokenPayload) => of({ id: payload.id, twid: payload.twid }))),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<unknown, { user: string}>),

		switchMap(req => Mongo.Get().collection('users').pipe(map(col => ({ req, col })))),
		switchMap(({ col, req }) => col.findOne({
			_id: ObjectId.createFromHexString(req.user?.id)
		})),
		map(user => ({ body: { ...user } }))
	))
);

export const UsersRoute = combineRoutes('/users', [
	GetCurrentUserRoute
]);
