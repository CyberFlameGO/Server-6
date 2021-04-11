import { HttpRequest, r } from '@marblejs/core';
import { ObjectId, FilterQuery } from 'mongodb';
import { Constants } from '@typings/src/Constants';
import { DataStructure } from '@typings/typings/DataStructure.v1';
import { defer, from, iif, noop, of } from 'rxjs';
import { switchMap, map, mapTo, tap } from 'rxjs/operators';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { Mongo } from 'src/Db/Mongo';
import { TwitchUser } from 'src/Components/TwitchUser';
import { HttpError } from 'src/Util/HttpError';

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
		map(req => req as HttpRequest<{}, GetEmoteParams, GetEmoteQuery> & WithUser),
		switchMap(req => iif(() => ObjectId.isValid(req.params.emote), // Reject the request if invalid object ID
			of(req),
			defer(() => HttpError.UnknownEmote(req))
		)),

		switchMap(req => Mongo.Get().collection('emotes').pipe(map(col => ({ col, req })))),
		switchMap(({ req, col }) => from(col.findOne({
			_id: ObjectId.createFromHexString((req.params as any).emote),
			status: { $not: { $eq: Constants.Emotes.Status.DELETED } }
		})).pipe(map(emote => ({ emote, req })))),

		// Verify the emote exists, if not, send 404
		switchMap(({ req, emote }) => !!emote ? of({ emote, req }) : HttpError.UnknownEmote(req)),

		// Get the authenticated user, if exists
		// This is for checking if it is a privileged user who may be able to view a private emote
		switchMap(({ req, emote }) => (emote?.private && !!req.user) ? req.user.getUser.pipe(mapTo({ req, emote })) : of({ req, emote })),
		switchMap(({ emote, req }) => (emote.private && !req.user.instance?.isMod()) ? (new ObjectId(emote.owner).equals(req.user?.id) ? of({ emote, req }) : HttpError.UnknownEmote(req)) : of(({ emote, req }))),

		// Get audit activity on this emote
		switchMap(({ emote, req }) => req.query.include_activity === 'true' ? Mongo.Get().collection('audit').pipe(
			tap(() => console.log(emote)),
			switchMap(col => col.find({
				target: { id: emote._id as ObjectId, type: 'emotes' },
				type: DataStructure.AuditLog.Entry.Type.EMOTE_EDIT
			}).sort({ _id: -1 }).limit(10).toArray()),
			map(entries => ({ audit_entries: entries, emote }))
		) : of({ emote, audit_entries: [] })),

		map(({ emote, audit_entries }) => ({
			body: {
				...emote,
				audit_entries
			}
		}))
	))
);
interface GetEmoteParams {
	emote: string;
}
interface GetEmoteQuery {
	include_activity: 'true' | 'false';
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
		switchMap(req => !!req.user ? req.user.getUser.pipe(mapTo(req)) : of(req)),
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
			}, (req.user?.instance?.data.rank ?? 0) >= Constants.Users.Rank.MODERATOR), // Allow jannies to view private emotes
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

const getQuery = (userID: ObjectId | string | undefined, options: GetQueryOptions, isMod = false) => {
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
		...o,
		$or: isMod ? [{}] : [{ private: false }, { owner: new ObjectId(userID) }],
		status: { $not: { $eq: Constants.Emotes.Status.DELETED } }
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
