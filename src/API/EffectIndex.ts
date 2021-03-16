import { AuthRoute } from 'src/API/Routes/v1/AuthRoute';
import { ChannelsRoute } from 'src/API/Routes/v1/ChannelsRoute';
import { EmotesRoute } from 'src/API/Routes/v1/Emotes';
import { WS_CreateEmoteStatus } from 'src/API/Routes/v1/Emotes/CreateEmoteRoute';
import { RootRoute, ExtensionRoute } from 'src/API/Routes/v1/RootRoute';
import { UsersRoute } from 'src/API/Routes/v1/Users';

export const HttpEffects = [
	RootRoute,
	ExtensionRoute,
	EmotesRoute,
	AuthRoute,
	UsersRoute,
	ChannelsRoute
];

export const WSEffects = [
	WS_CreateEmoteStatus
];
