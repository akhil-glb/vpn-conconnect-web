import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { config } from '../config';

interface VersionInfo {
  latest: string;
  minimum: string;
  mandatory: boolean;
  downloadUrl: string;
  sha256: string;
  releaseNotes: string;
}

const osParamSchema = z.object({
  version: z.string().min(1),
  os: z.enum(['WINDOWS', 'MACOS', 'LINUX']),
});

const updatesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /updates/version — public endpoint for clients to check for updates
  fastify.get(
    '/version',
    { config: { public: true } },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const versionFilePath = path.join(config.updateFilesPath, 'version.json');

        if (!fs.existsSync(versionFilePath)) {
          return reply.status(404).send({ error: 'Version info not available' });
        }

        const raw = fs.readFileSync(versionFilePath, 'utf-8');
        const versionInfo = JSON.parse(raw) as VersionInfo;

        return reply.send(versionInfo);
      } catch (err) {
        fastify.log.error({ err }, 'Get version error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /updates/download/:version/:os — stream installer file
  fastify.get(
    '/download/:version/:os',
    { preHandler: [fastify.authenticateDevice] },
    async (req: FastifyRequest<{ Params: { version: string; os: string } }>, reply: FastifyReply) => {
      try {
        const parsed = osParamSchema.safeParse(req.params);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid parameters', details: parsed.error.flatten() });
        }

        const { version, os } = parsed.data;

        // Map OS to file extension
        const ext: Record<string, string> = {
          WINDOWS: 'exe',
          MACOS: 'dmg',
          LINUX: 'AppImage',
        };

        const fileName = `VPN_ConConnect-${version}-${os.toLowerCase()}.${ext[os]}`;
        const filePath = path.join(config.updateFilesPath, version, fileName);

        // Prevent path traversal
        const resolvedPath = path.resolve(filePath);
        const resolvedBase = path.resolve(config.updateFilesPath);
        if (!resolvedPath.startsWith(resolvedBase)) {
          return reply.status(400).send({ error: 'Invalid path' });
        }

        if (!fs.existsSync(filePath)) {
          return reply.status(404).send({ error: 'Update file not found' });
        }

        const stat = fs.statSync(filePath);
        const fileStream = fs.createReadStream(filePath);

        return reply
          .header('Content-Type', 'application/octet-stream')
          .header('Content-Disposition', `attachment; filename="${fileName}"`)
          .header('Content-Length', stat.size.toString())
          .send(fileStream);
      } catch (err) {
        fastify.log.error({ err }, 'Download update error');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default updatesRoutes;
