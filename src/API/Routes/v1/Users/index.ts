import { combineRoutes } from '@marblejs/core';
import { GetUserRoute } from 'src/API/Routes/v1/Users/GetUserRoute';

export const UsersRoute = combineRoutes('/users', [
	GetUserRoute
]);
