import { combineRoutes } from '@marblejs/core';
import { CreateEmoteRoute } from 'src/API/Routes/Emotes/CreateEmoteRoute';
import { DeleteEmoteRoute } from 'src/API/Routes/Emotes/DeleteEmoteRoute';
import { EditEmoteRoute } from 'src/API/Routes/Emotes/EditEmoteRoute';
import { GetEmotesRoute, GetEmoteRoute } from 'src/API/Routes/Emotes/GetEmotesRoute';

export const EmotesRoute = combineRoutes('/emotes', [
	GetEmotesRoute,
	GetEmoteRoute,
	CreateEmoteRoute,
	DeleteEmoteRoute,
	EditEmoteRoute
]);
