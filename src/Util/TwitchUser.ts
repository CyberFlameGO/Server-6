import { DataStructure, MongoDocument } from '@typings/typings/DataStructure';
import { API } from '@typings/typings/API';
import { Config } from 'src/Config';
import { Constants } from 'src/Util/Constants';
import { Mongo } from 'src/Db/Mongo';
import { mapTo, mergeAll, pluck, switchMap, take, tap } from 'rxjs/operators';
import { ObjectId } from 'mongodb';
import { from, iif, Observable, of, throwError } from 'rxjs';
import superagent from 'superagent';
import { Emote } from 'src/Emotes/Emote';

export class TwitchUser {
	id: ObjectId | (null | undefined) = null;
	private grant: API.OAuth2.AuthCodeGrant | null = null;

	constructor(public data: DataStructure.TwitchUser) {
		if (!!data._id && ObjectId.isValid(data._id)) this.id = new ObjectId(data._id);
	}

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

			const col = Mongo.Get().collection('users');
			col.pipe(
				switchMap(col => from(col.updateOne({
					id: this.data.id // Resolve user by their Twitch ID
				}, {
					$set: { ...this.data }
				}, { upsert: true })).pipe(mapTo(col))),

				// Get user's app ID
				switchMap(col => col.find({ id: this.data.id }, { projection: ['_id'] }).toArray() as Promise<MongoDocument[]>),
				mergeAll(),
				take(1), pluck('_id'), // Emit only _id field
				tap(id => this.id = id),
				tap(() => observer.next(this))
			).subscribe({
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
			});
		});
	}

	toString(): string {
		return `${this.data.display_name} (${this.data.login}, ${this.data.id})`;
	}
}

export namespace TwitchUser {

}
