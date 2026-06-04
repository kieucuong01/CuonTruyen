import { handleLogin, withUserApi } from '../../server/userApi.mjs';
export default withUserApi(handleLogin);
