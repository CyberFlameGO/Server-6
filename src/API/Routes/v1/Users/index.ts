import { combineRoutes } from '@marblejs/core';
import { EditUserRoute } from 'src/API/Routes/v1/Users/EditUserRoute';
import { GetUserRoute } from 'src/API/Routes/v1/Users/GetUserRoute';

export const UsersRoute = combineRoutes('/users', [
	GetUserRoute,
	EditUserRoute
]);
