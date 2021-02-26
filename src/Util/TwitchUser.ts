import { API } from '@typings/API';
import { twitch_client_id } from 'Config';
import { Observable } from 'rxjs';
import { Constants } from 'src/Util/Constants';
import superagent from 'superagent';


export class TwitchUser {
	constructor(public data: API.TwitchUser) {}

	static connect(accessToken: API.OAuth2.AuthCodeGrant): Observable<TwitchUser> {
		return new Observable<TwitchUser>(observer => {
			console.log(accessToken);
			superagent.get(`${Constants.TWITCH_API_BASE}/helix/users`)
				.set('Authorization', `Bearer ${accessToken.access_token}`)
				.set('Client-Id', twitch_client_id)
				.end((err, res) => {
					if (err) return observer.error(err);

					console.log(res.body);
					observer.next(new TwitchUser(res.body.data[0] as API.TwitchUser));
				});
		});
	}
}

export namespace TwitchUser {

}
