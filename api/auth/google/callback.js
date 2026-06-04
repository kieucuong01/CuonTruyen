import { handleGoogleCallback, withGoogleAuthApi } from '../../../server/googleAuthApi.mjs';

export default withGoogleAuthApi(handleGoogleCallback);
