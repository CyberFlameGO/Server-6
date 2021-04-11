import { HttpRequest } from '@marblejs/core';
import { DataStructure } from '@typings/typings/DataStructure.v1';
import { Observable } from 'rxjs';


export const PermissionMiddleware = (permissions: keyof typeof DataStructure.Role.Permission) => (req$: Observable<HttpRequest>) => req$.pipe(

);
