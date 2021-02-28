import Cfg from '@Config';

export const Config = {
	...Cfg
} as ConfigType ;

type TypeofCfg = typeof Cfg;
interface ConfigType extends TypeofCfg {
	[x: string]: any;
	[x: number]: any;
}
