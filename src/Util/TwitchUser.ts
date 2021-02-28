import { DataStructure } from '@typings/DataStructure';
import { API } from '@typings/API';
import { Config } from 'src/Config';
import { iif, Observable, of, throwError } from 'rxjs';
import { Constants } from 'src/Util/Constants';
import superagent from 'superagent';
import { Mongo } from 'src/Db/Mongo';
import { switchMap, tap } from 'rxjs/operators';


export class TwitchUser {
	private grant: API.OAuth2.AuthCodeGrant | null = null;

	constructor(public data: DataStructure.TwitchUser) {}

	static connect(accessToken: API.OAuth2.AuthCodeGrant): Observable<TwitchUser> {
		return new Observable<TwitchUser>(observer => {
			superagent.get(`${Constants.TWITCH_API_BASE}/helix/users`)
				.set('Authorization', `Bearer ${accessToken.access_token}`)
				.set('Client-Id', Config.twitch_client_id)
				.end((err, res) => {
					if (err) return observer.error(err);

					const user = new TwitchUser(res.body.data[0] as DataStructure.TwitchUser);
					user.grant = accessToken;
					observer.next(user);
				});
		});
	}

	/**
	 * Get the user's bearer token
	 */
	getToken(): Observable<DataStructure.BearerToken> {
		return new Observable<DataStructure.BearerToken>(observer => {
			if (!this.data) return observer.error(Error('Cannot find token grant data while the user is unitialiazed'));

			Mongo.Get().collection('oauth').pipe(
				switchMap(col => col.findOne({
					user_id: this.data.id
				})),

				switchMap(data => iif(() => !!data,
					of(data as DataStructure.BearerToken),
					throwError(Error('No bearer token exists for this user'))
				))
			).subscribe({
				next(data) { observer.next(data); }
			});
		});
	}

	/**
	 * Write the current bearer token grant to database
	 */
	writeToken(): Observable<TwitchUser> {
		return new Observable<TwitchUser>(observer => {
			if (!this.grant) return observer.error(Error('Cannot write unitialized token grant data'));
			if (!this.data) return observer.error(Error('Cannot write token grant data while the user is unitialiazed'));

			Mongo.Get().collection('oauth').pipe(
				switchMap(col => col.updateOne({
					user_id: this.data.id
				}, {
					$set: {
						...this.grant
					}
				}, { upsert: true })),

				tap(() => observer.next(this))
			).subscribe({
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
			});
		});
	}

	/**
	 * Create or update this user in the database
	 */
	writeUser(): Observable<TwitchUser> {
		return new Observable(observer => {
			if (!this.data) return observer.error(Error('Cannot write unitialized user'));

			Mongo.Get().collection('users').pipe(
				switchMap(col => col.updateOne({
					id: this.data.id
				}, {
					$set: { ...this.data }
				}, { upsert: true })),

				tap(() => observer.next(this))
			).subscribe({
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
			});
		});
	}
}

export namespace TwitchUser {

}
