//@ts-check
require('dotenv').config();

const argv = require('minimist')(process.argv.slice(2));
console.log(argv);

const secrets = [
  'DINGTALK_SECRET',
  'DINGTALK_WEBHOOK_URL',
  'SELF_GITHUB_WEBHOOK_SECRET',
];

const define = {};
for (const s of secrets) {
  if (process.env[s]) {
    define[s] = JSON.stringify(process.env[s].trim());
  } else {
    console.error(`process.env.${s} not found!`);
    process.exit(1);
  }
}

require('esbuild')
  .build({
    entryPoints: ['./src'],
    bundle: true,
    outfile: './index.js',
    minify: true,
    color: true,
    define: {
      ...define,
    },
    watch: argv['watch'],
  })
  .then((result) => {
    console.log(result);
  })
  .catch((e) => {
    throw e;
  });
