import { handleBulletinMessages, withBulletinApi } from '../../server/bulletinApi.mjs';

export default withBulletinApi(handleBulletinMessages);
