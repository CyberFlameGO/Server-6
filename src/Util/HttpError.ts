import { HttpRequest } from '@marblejs/core';

export namespace HttpError {
	export const UnknownEmote = (req: HttpRequest) => req.response.send({ status: 404, body: { error: 'Unknown Emote' } });

	export const InvalidObjectId = (req: HttpRequest, type: string) => req.response.send({ status: 400, body: { error: 'Invalid Object ID' + (type ? ` (${type})` : '') } });
}
