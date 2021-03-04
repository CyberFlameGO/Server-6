import { combineRoutes, HttpRequest, r } from '@marblejs/core';
import { map, mapTo, switchMap } from 'rxjs/operators';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { EmoteStore } from 'src/Emotes/EmoteStore';

namespace AddChannelEmote {
	/**
	* PUT /:channel/emotes/:emote
	*
	* Add an emote to a channel
	*/
	export const Route = r.pipe(
		r.matchPath('/:channel/emotes/:emote'),
		r.matchType('PUT'),
		r.use(AuthorizeMiddleware(false)),
		r.useEffect(req$ => req$.pipe(
			map(req => req as HttpRequest<{}, Params, {}> & WithUser),

			switchMap(req => EmoteStore.Get().findEmote(req.params.emote)),
			mapTo({})
		))
	);

	interface Params {
		channel: string;
		emote: string;
	}
}

const DeleteChannelEmoteRoute = r.pipe(
	r.matchPath('/:channel/emotes/:emote'),
	r.matchType('DELETE'),
	r.useEffect(req$ => req$.pipe(

	))
);

export const ChannelsRoute = combineRoutes('/channels', [
	AddChannelEmote.Route
]);
