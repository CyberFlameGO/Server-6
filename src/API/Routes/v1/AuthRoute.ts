import { combineRoutes, r } from '@marblejs/core';
import { Config } from 'src/Config';
import { concatAll, map, mapTo, switchMap } from 'rxjs/operators';
import { post } from 'superagent';
import { asyncScheduler, Observable, scheduled } from 'rxjs';
import { API } from '@typings/typings/API';
import { TwitchUser } from 'src/Components/TwitchUser';
import jwt from 'jsonwebtoken';

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
						`?client_id=${Config.twitch_client_id}`,
						`&redirect_uri=${redirectURI}`,
						'&response_type=code'
					)
				}
			})
		))
	);
	export const redirectURI = `${Config.tls ? 'https' : 'http'}://${Config.api_url}/auth/callback`;
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
			switchMap(req => ExchangeCode((req.query as { code: string }).code)), // Exchange received code for an access token grant
			switchMap(grant => TwitchUser.connect(grant)), // Connect as the Twitch
			switchMap(user => scheduled([
				user.writeUser(),
				user.writeToken()
			], asyncScheduler).pipe(concatAll())), // Update (or create) user & token grant in the DB

			// Generate a JWR
			map(user => jwt.sign({
				id: user.id,
				twid: user.data.id
			}, Config.jwt_secret, { expiresIn: 604800 })),
			map(jwt => ({
				status: 301,
				headers: { 'Location': `${Config.app_url}/callback?token=${jwt}` }
			}))
		))
	);

	export const TwitchBase = `https://id.twitch.tv`;

	export const ExchangeCode = (code: string): Observable<API.OAuth2.AuthCodeGrant> => {
		return new Observable<API.OAuth2.AuthCodeGrant>(observer => {
			const url = `${TwitchBase}/oauth2/token`.concat(
				`?client_id=${Config.twitch_client_id}`,
				`&client_secret=${Config.twitch_client_secret}`,
				`&code=${code}`,
				'&grant_type=authorization_code',
				`&redirect_uri=${GetAuthURL.redirectURI}`
			);

			post(url, (err: Error, res) => {
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
