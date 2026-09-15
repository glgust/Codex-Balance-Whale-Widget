if(process.argv.includes('--smoke-test'))require('./smoke.cjs');
else require('./main.cjs');
