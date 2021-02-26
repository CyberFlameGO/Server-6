import { combineRoutes, HttpRequest, r } from '@marblejs/core';
import { hostname, twitch_client_id, twitch_client_secret, tls, app_url } from 'Config';
import { map, mapTo, switchMap, tap } from 'rxjs/operators';
import { post } from 'superagent';
import { Observable } from 'rxjs';
import { API } from '@typings/API';
import { TwitchUser } from 'src/Util/TwitchUser';

namespace GetAuthURL {
	/**
	 * GET /auth
	 *
	 * Get a Twitch OAuth2 Authorization URL
	 */
	export const Route = r.pipe(
		r.matchPath('/'),
		r.matchType('GET'),
		r.useEffect(req$ => req$.pipe(
			mapTo({
				body: {
					url: ''.concat(
						'https://id.twitch.tv/oauth2/authorize',
						`?client_id=${twitch_client_id}`,
						`&redirect_uri=${redirectURI}`,
						'&response_type=code'
					)
				}
			})
		))
	);
	export const redirectURI = `${tls ? 'https' : 'http'}://${hostname}/auth/callback`;
}


namespace AuthCallback {
	/**
	 * GET /auth/callback
	 *
	 * Callback endpoint for Twitch OAuth2
	 */
	export const Route = r.pipe(
		r.matchPath('/callback'),
		r.matchType('GET'),
		r.useEffect(req$ => req$.pipe(
			// map(req => ({
			// 	body: getMarkupWrapper(hostname, { Pag: 'Man' }),
			// 	headers: { 'Content-Type': 'text/html' }
			// }))
			switchMap(req => ExchangeCode((req.query as { code: string }).code)),
			switchMap(grant => TwitchUser.connect(grant)),
			tap(x => console.log(x)),
			map(grant => ({
				status: 301,
				headers: { 'Location': `${app_url}/callback?data=${JSON.stringify(grant.data)}` }
			}))
		))
	);

	export const TwitchBase = `https://id.twitch.tv`;

	export const ExchangeCode = (code: string): Observable<API.OAuth2.AuthCodeGrant> => {
		return new Observable<API.OAuth2.AuthCodeGrant>(observer => {
			const url = `${TwitchBase}/oauth2/token`.concat(
				`?client_id=${twitch_client_id}`,
				`&client_secret=${twitch_client_secret}`,
				`&code=${code}`,
				'&grant_type=authorization_code',
				`&redirect_uri=${GetAuthURL.redirectURI}`
			);

			post(url, (err: Error, res) => {
				console.log(err);
				if (err) return observer.error(err);

				observer.next(res.body as API.OAuth2.AuthCodeGrant);
				observer.complete();
			});
		});

	};
}

export const AuthRoute = combineRoutes('/auth', [
	GetAuthURL.Route,
	AuthCallback.Route
]);
