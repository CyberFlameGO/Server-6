const path = require('path');
const { workerData } = require('worker_threads');

try {
require('ts-node').register({
	typeCheck: false,
	project: './tsconfig.json',
	transpileOnly: true,
	compilerOptions: {
		skipLibCheck: true,
		noImplicitAny: false
	}
});
require(path.resolve(__dirname, workerData.workerFile));
} catch (e) { console.error('Worker BootStrap Error', e); }