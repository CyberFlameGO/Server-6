import { combineRoutes, r, use } from '@marblejs/core';
import { map, switchMap, tap } from 'rxjs/operators';
import { DataStructure } from '@typings/DataStructure';
import { multipart$ } from '@marblejs/middleware-multipart';
import { EmoteStore } from 'src/Emotes/EmoteStore';
import { noop, of } from 'rxjs';
import { authorize$ } from '@marblejs/middleware-jwt';
import { Config } from 'src/Config';
import { Emote } from 'src/Emotes/Emote';
import { basename, extname } from 'path';
import { API } from '@typings/API';
import { ObjectId } from 'mongodb';
import { Mongo } from 'src/Db/Mongo';

const MockData = [
	{
		name: 'xqcL',
		owner: 'Your Mom',
		// url: 'https://cdn.discordapp.com/emojis/797197297675010071.gif?v=1&size=32'
	},
	{
		name: 'PagMan',
		owner: 'Your Mom',
		// url: 'https://cdn.discordapp.com/emojis/732824111788851222.png?v=1&size=32'
	},
	{
		name: 'FeelsOkayMan',
		owner: 'Your Mom',
		// url: 'https://cdn.discordapp.com/emojis/695171992688787518.png?v=1&size=32'
	}
] as DataStructure.Emote[];

/**
 * GET /emotes/:channel
 *
 * List emotes for a speficic channel
 */
const GetChannelEmotes = r.pipe(
	r.matchPath('/:channel'),
	r.matchType('GET'),
	r.useEffect(req$ => req$.pipe(
		map(req => {
			console.log(req.params);
			return { body: MockData };
		})
	))
);

/**
 * GET /emotes
 * Query: {  }
 *
 * Get a list of public emotes
 */
const GetEmotes = r.pipe(
	r.matchPath('/'),
	r.matchType('GET'),
	r.useEffect(req$ => req$.pipe(
		switchMap(req => Mongo.Get().collection('emotes').pipe(map(col => ({ col, req })))),
		switchMap(({ req, col }) => col.find({  }).limit(200).toArray()),
		map(emotes => ({
			body: emotes
		}))
	))
);

/**
 * POST /emotes
 *
 * Create a new Emote
 */
const CreateEmote = r.pipe(
	r.matchPath('/'),
	r.matchType('POST'),
	r.use(authorize$({ // Authenticate the user
		secret: Config.jwt_secret
	}, (payload: API.TokenPayload) => of({ id: payload.id, twid: payload.twid }))),
	r.useEffect(req$ => req$.pipe(
		switchMap(req => of(req).pipe(
			use(multipart$({ // Get multipart file
				stream: ({ file, encoding, mimetype, filename, fieldname  }) => {
					console.log(encoding, mimetype, filename, fieldname, req.user);
					return EmoteStore.Get().create(file, {
						mime: mimetype,
						name: basename(filename, extname(filename)),
						owner: ObjectId.createFromHexString(req.user.id)
					}).pipe(
						tap(emote => req.meta ? req.meta.emote = emote : noop()), // Stick emote to request meta
						map(emote => ({ destination: `${emote.filepath}/og` })),
					);
				}
			})),
			map(req => ({
				req,
				emote: req.meta?.emote as Emote
			}))
		)),
		map(({ emote, req }) => ({
			body: emote.resolve()
		}))
	))
);

export const EmotesRoute = combineRoutes('/emotes', [
	GetEmotes,
	CreateEmote,
	GetChannelEmotes
]);
