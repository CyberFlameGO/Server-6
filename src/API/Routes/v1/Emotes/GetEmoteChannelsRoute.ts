import { HttpRequest, r } from '@marblejs/core';
import { ObjectId } from 'mongodb';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Mongo } from 'src/Db/Mongo';
import { HttpError } from 'src/Util/HttpError';


export const GetEmoteChannelsRoute = r.pipe(
	r.matchPath('/:emote/channels'),
	r.matchType('GET'),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<{}, Params, {}>),

		switchMap(req => ObjectId.isValid(req.params.emote) ? of(req) : HttpError.InvalidObjectId(req, 'Emote')),
		switchMap(req => Mongo.Get().collection('users').pipe(map(col => ({ col, req })))),
		switchMap(({ col, req }) => col.find({
			emotes: { $in: [new ObjectId(req.params.emote)] }
		}, { projection: ['_id', 'broadcaster_type', 'login', 'display_name', 'rank', 'profile_image_url'] }).toArray()),

		map(users => ({
			body: {
				count: users.length,
				users: users.map(user => user)
			}
		}))
	))
);

interface Params {
	emote: string;
}
