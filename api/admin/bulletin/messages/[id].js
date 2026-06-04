import { handleAdminBulletinMessage, withAdminBulletinApi } from '../../../../server/bulletinApi.mjs';

export default withAdminBulletinApi(handleAdminBulletinMessage);
