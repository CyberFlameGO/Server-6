import { combineRoutes } from '@marblejs/core';
import { CreateEmoteRoute } from 'src/API/Routes/v1/Emotes/CreateEmoteRoute';
import { DeleteEmoteRoute } from 'src/API/Routes/v1/Emotes/DeleteEmoteRoute';
import { EditEmoteRoute } from 'src/API/Routes/v1/Emotes/EditEmoteRoute';
import { GetEmotesRoute, GetEmoteRoute } from 'src/API/Routes/v1/Emotes/GetEmotesRoute';

export const EmotesRoute = combineRoutes('/emotes', [
	GetEmotesRoute,
	GetEmoteRoute,
	CreateEmoteRoute,
	DeleteEmoteRoute,
	EditEmoteRoute
]);
