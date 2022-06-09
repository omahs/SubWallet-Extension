// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const CRON_REFRESH_PRICE_INTERVAL = 30000;
export const DOTSAMA_API_TIMEOUT = 30000;
export const DOTSAMA_AUTO_CONNECT_MS = 3000;
export const DOTSAMA_MAX_CONTINUE_RETRY = 2;
export const CRON_AUTO_RECOVER_DOTSAMA_INTERVAL = 60000;
export const CRON_AUTO_RECOVER_WEB3_INTERVAL = 90000;
export const ACALA_REFRESH_CROWDLOAN_INTERVAL = 300000;
export const ACALA_REFRESH_BALANCE_INTERVAL = 30000;
export const ASTAR_REFRESH_BALANCE_INTERVAL = 30000;
export const MOONBEAM_REFRESH_BALANCE_INTERVAL = 30000;
export const CRON_REFRESH_NFT_INTERVAL = 900000;
export const CRON_REFRESH_STAKING_REWARD_INTERVAL = 900000;
export const CRON_REFRESH_HISTORY_INTERVAL = 90000;
export const CRON_GET_API_MAP_STATUS = 5000;

export const ALL_ACCOUNT_KEY = 'ALL';
export const ALL_NETWORK_KEY = 'all';
export const ALL_GENESIS_HASH = null;
export const IGNORE_GET_SUBSTRATE_FEATURES_LIST: string[] = ['astarEvm'];

export const EVM_PROVIDER_RPC_ERRORS: Record<string, [number, string, string]> = {
  USER_REJECTED_REQUEST: [4001, 'User Rejected Request', 'The user rejected the request.'],
  UNAUTHORIZED: [4100, 'Unauthorized', 'The requested method and/or account has not been authorized by the user.'],
  UNSUPPORTED_METHOD: [4200, 'Unsupported Method', 'The Provider does not support the requested method.'],
  DISCONNECTED: [4900, 'Disconnected', 'The Provider is disconnected from all chains.'],
  CHAIN_DISCONNECTED: [4901, 'Chain Disconnected', 'The Provider is not connected to the requested chain.']
};
