import { handleAdminBulletinMessages, withAdminBulletinApi } from '../../../server/bulletinApi.mjs';

export default withAdminBulletinApi(handleAdminBulletinMessages);
