#!/usr/bin/env node

/**
 * resumessi — Build Script
 *
 * Compiles public/app.ts and public/findJob-app.ts → public/dist/ via esbuild.
 *
 * Usage:
 *   tsx build.ts
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname);

async function buildFrontend(): Promise<void> {
	const entryPoint = path.join(ROOT, 'public', 'app.ts');
	const findJobEntryPoint = path.join(ROOT, 'public', 'findJob-app.ts');
	const outDir = path.join(ROOT, 'public', 'dist');

	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true });
	}

	try {
		const entryPoints: string[] = [];
		if (fs.existsSync(entryPoint)) entryPoints.push(entryPoint);
		if (fs.existsSync(findJobEntryPoint)) entryPoints.push(findJobEntryPoint);

		if (entryPoints.length > 0) {
			await esbuild.build({
				entryPoints,
				bundle: true,
				minify: true,
				outdir: outDir,
				format: 'iife',
				target: 'es2020',
				platform: 'browser',
			});
			console.info(`Built frontend bundles in: ${path.relative(ROOT, outDir)}`);
		}
	} catch (err: unknown) {
		console.error('Frontend build failed:', (err as Error).message);
		process.exit(1);
	}
}

buildFrontend().then(() => {
	console.info('\nBuild completed successfully. Run `npm start` to launch the app.');
});
