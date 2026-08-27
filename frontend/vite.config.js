import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const scriptPath = path.resolve(projectRoot, 'traffic-model', 'scripts', 'run_simulation_cli.py');

/**
 * Custom Vite Plugin to proxy POST /api/simulate requests directly to the Python backend simulator.
 */
function pythonSimulatorPlugin() {
  return {
    name: 'vite-python-simulator-plugin',
    configureServer(server) {
      server.middlewares.use('/api/simulate', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 450;
          res.end(JSON.stringify({ error: 'Method not allowed. Only POST is supported.' }));
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });

        req.on('end', () => {
          if (!body || body.trim() === '') {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Empty payload provided.' }));
            return;
          }

          // Spawn Python CLI simulation bridge runner
          const pyProcess = spawn('python', [scriptPath], {
            cwd: projectRoot,
            env: process.env,
          });

          let stdoutData = '';
          let stderrData = '';

          pyProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
          });

          pyProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
          });

          pyProcess.on('close', (code) => {
            res.setHeader('Content-Type', 'application/json');

            if (code !== 0) {
              res.statusCode = 500;
              let errText = stderrData || stdoutData || 'Python simulation process failed.';
              try {
                const parsedErr = JSON.parse(stdoutData);
                if (parsedErr.error) errText = parsedErr.error;
              } catch (e) {
                // Not JSON error
              }
              res.end(JSON.stringify({ error: errText }));
              return;
            }

            try {
              const jsonRes = JSON.parse(stdoutData);
              res.statusCode = 200;
              res.end(JSON.stringify(jsonRes));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Invalid JSON returned from Python simulator.', raw: stdoutData }));
            }
          });

          // Write payload to stdin
          pyProcess.stdin.write(body);
          pyProcess.stdin.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [cesium(), pythonSimulatorPlugin()],
  server: {
    port: 3000,
    open: false,
  },
});
