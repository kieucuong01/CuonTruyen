import { handleNodeRequest } from '../../server/index.mjs';

export default async function handler(req, res) {
  await handleNodeRequest(req, res);
}
