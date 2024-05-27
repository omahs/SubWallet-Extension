// Copyright 2019-2022 @subwallet/extension-base
// SPDX-License-Identifier: Apache-2.0

import { ERC20_ABI } from '@subwallet/extension-base/services/chain-service/helper';
import { _EvmApi } from '@subwallet/extension-base/services/chain-service/types';
import { Contract } from 'web3-eth-contract';

export const getERC20Contract = (assetAddress: string, evmApi: _EvmApi, options = {}): Contract<typeof ERC20_ABI> => {
  return new evmApi.api.eth.Contract(ERC20_ABI, assetAddress, options);
};
