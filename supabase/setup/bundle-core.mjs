// Packages packages/core as one JavaScript file the Edge Functions can import, so the server runs the very rules the
// handhelds run. Deno can't follow core's extensionless imports, so it gets this bundle instead. Run before deploying a
// function that imports ../_shared/core.js: pnpm functions:bundle
import { build } from 'rolldown';

await build({
  input: 'packages/core/src/index.ts',
  output: {
    file: 'supabase/functions/_shared/core.js',
    format: 'esm',
    banner: '// Built from packages/core by supabase/setup/bundle-core.mjs. Do not edit: change core and bundle again.',
  },
  logLevel: 'warn',
});
console.log('Bundled packages/core into supabase/functions/_shared/core.js');
