import { r } from '@marblejs/core';
import { map, mapTo } from 'rxjs/operators';
import { Config } from 'src/Config';

export const RootRoute = r.pipe(
	r.matchPath('/'),
	r.matchType('GET'),
	r.useEffect(req => req.pipe(
		mapTo({ body: { message: '7TV API' } }),
	))
);

export const ExtensionRoute = r.pipe(
	r.matchPath('/extension'),
	r.matchType('GET'),
	r.useEffect(req$ => req$.pipe(
		map(() => ({
			body: {
				version: Config.extension_version,
				release_url: Config.extension_release_url
			}
		}))
	))
);
