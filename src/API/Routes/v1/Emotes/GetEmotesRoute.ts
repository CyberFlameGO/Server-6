import { HttpRequest, r } from '@marblejs/core';
import { ObjectId, FilterQuery } from 'mongodb';
import { Constants } from '@typings/src/Constants';
import { DataStructure } from '@typings/typings/DataStructure';
import { defer, from, iif, noop, of } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { Mongo } from 'src/Db/Mongo';
import { TwitchUser } from 'src/Util/TwitchUser';

const unknownEmoteError = (req: HttpRequest) => req.response.send({ status: 404, body: { error: 'Unknown Emote' } });
/**
 * GET /emotes/:emote
 *
 * Get a single emote
 */
export const GetEmoteRoute = r.pipe(
	r.matchPath('/:emote'),
	r.matchType('GET'),
	r.use(AuthorizeMiddleware(true)),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<{}, GetEmoteParams>),
		switchMap(req => iif(() => ObjectId.isValid(req.params.emote), // Reject the request if invalid object ID
			of(req),
			defer(() => unknownEmoteError(req))
		)),
		switchMap(req => Mongo.Get().collection('emotes').pipe(map(col => ({ col, req })))),
		switchMap(({ req, col }) => from(col.findOne({
			_id: ObjectId.createFromHexString((req.params as any).emote),
			status: { $not: { $eq: Constants.Emotes.Status.DELETED } }
		})).pipe(map(emote => ({ emote, req })))),
		switchMap(({ req, emote }) => !!emote ? of({ emote, req }) : unknownEmoteError(req)),
		switchMap(({ emote, req }) => emote.private ? (new ObjectId(emote.owner).equals(req.user?.id) ? of(emote) : unknownEmoteError(req)) : of(emote)),
		map(emote => ({
			body: emote
		}))
	))
);
interface GetEmoteParams {
	emote: string;
}

/**
 * GET /emotes
 * Query: {  }
 *
 * Get a list of public emotes
 */
export const GetEmotesRoute = r.pipe(
	r.matchPath('/'),
	r.matchType('GET'),
	r.use(AuthorizeMiddleware(true)),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<{}, {}, (Query & GetQueryOptions)> & WithUser),

		// Handle channel param
		switchMap(req => iif(() => typeof req.query.channel === 'string' && (req.query.channel === '@me' || ObjectId.isValid(req.query.channel)),
			TwitchUser.find((req.query.channel  === '@me') ? String(req.user.id) : req.query.channel as string),
			of(undefined)
		).pipe(map(targetChannel => ({ req, targetChannel })))),

		map(({ targetChannel, req }) => ({
			query: getQuery(req.user?.id, {
				name: req.query.name ?? undefined,
				hideGlobal: req.query.hideGlobal === 'true',
				globalEmotes: req.query.globalEmotes ?? 'include',
				channel: targetChannel as TwitchUser,
				submitter: req.query.submitter ?? undefined
			}),
			req
		})),
		switchMap(({ req, query }) => Mongo.Get().collection('emotes').pipe(map(col => ({ col, req, query })))),
		switchMap(x => from(x.col.countDocuments(x.query)).pipe(map(totalEstimatedSize => ({ totalEstimatedSize, ...x })))),
		switchMap(async ({ req, col, totalEstimatedSize, query }) => { // Begin pagination
			const page = parseInt(req.query.page ?? 1); // The requested page (1 if unset)
			const pageSize = parseInt(req.query.pageSize ?? 16); // The requested size of the page (amount of documents to show)
			const skip = (page - 1) * pageSize; // How many documents should be skipped in order to reach the requested range

			return col.aggregate([ // Create aggregation pipeline
				{ $match: query },
				{ $skip: skip },
				{ $limit: pageSize }
			]).toArray().then(emotes => ({ emotes, totalEstimatedSize }));
		}),
		map(({ emotes, totalEstimatedSize }) => ({
			body: {
				total_estimated_size: totalEstimatedSize,
				emotes
			}
		}))
	))
);

const getQuery = (userID: ObjectId | string | undefined, options: GetQueryOptions) => {
	const o = {} as FilterQuery<Partial<DataStructure.Emote>>;
	options.hideGlobal === true ? o.global = { $not: { $eq: true } } as any : noop();
	if (options.globalEmotes) {
		({ // Handle globalEmotes query
			include: () => noop(),
			only: () => o.global = true,
			hide: () => o.global = { $not: { $eq: true } }
		} as { [key in GetQueryOptions['globalEmotes']]: () => void })[options.globalEmotes ?? (() => noop())]();
	}
	options.name?.length > 0 ? o.name = { $regex: new RegExp(options.name, 'i') } : noop();
	options.submitter?.length > 0 ? o.owner_name = { $regex: new RegExp(options.submitter, 'i') } : noop();
	options.channel instanceof TwitchUser ? o._id = { $in: [...options.channel.data.emotes?.map(id => new ObjectId(id)) ?? []] } : noop();

	return { // Match non-private emotes (unless user is owner)
		$or: [{ private: false }, { owner: userID }],
		...o
	} as FilterQuery<DataStructure.Emote>;
};

interface GetQueryOptions {
	name: string;
	submitter: string;
	globalEmotes: 'only' | 'hide' | 'include';
	channel: string | TwitchUser;
	/** @deprecated Use globalEmotes instead  */
	hideGlobal: string | boolean;
}
interface Query {
	page: string;
	pageSize: string;
}
