import Cfg from '@Config';

export const Config = {
	...Cfg
} as ConfigType ;

type TypeofCfg = typeof Cfg;
interface ConfigType extends TypeofCfg {
	[x: string]: any;
	[x: number]: any;
}

// Import config nodes from environment?
{
	const keys = Object.keys(process.env).filter(k => k.startsWith('cfg_'));
	for (const k of keys) {
		const qualifiedKey = k.replace('cfg_', '');
		console.log(k, qualifiedKey);
		(Config as any)[qualifiedKey] = process.env[k];
	}
}
