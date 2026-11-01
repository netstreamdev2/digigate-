// Lets Node run our TypeScript straight from source: core's imports leave off the .ts that Node insists on, and the
// Edge Functions name packages the Deno way.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('npm:')) return nextResolve(specifier.slice(4).replace(/@[^/]*$/, ''), context);
    const ours = !context.parentURL?.includes('node_modules');
    const relative = ours && (specifier.startsWith('./') || specifier.startsWith('../'));
    return nextResolve(relative && !/\.[cm]?[jt]s$/.test(specifier) ? `${specifier}.ts` : specifier, context);
  },
});
