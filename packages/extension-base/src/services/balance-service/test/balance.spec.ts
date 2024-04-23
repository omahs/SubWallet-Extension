// Copyright 2019-2022 @subwallet/extension-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { cryptoWaitReady } from '@polkadot/util-crypto';
import { ChainAssetMap, ChainInfoMap } from '@subwallet/chain-list';
import { subscribeBalance } from '@subwallet/extension-base/services/balance-service/helpers';
import { calculateTotalBalance, calculateLockedBalance, calculateTransferableBalance, calculateTotalLockedBalance, calculateStakeableBalance } from '@subwallet/extension-base/services/balance-service/helpers/convert';
import { EvmChainHandler } from '@subwallet/extension-base/services/chain-service/handler/EvmChainHandler';
import { SubstrateChainHandler } from '@subwallet/extension-base/services/chain-service/handler/SubstrateChainHandler';
import { AccountsStore } from '@subwallet/extension-base/stores';
import KeyringStore from '@subwallet/extension-base/stores/Keyring';
import { BalanceItem, PalletStakingStakingLedger } from '@subwallet/extension-base/types';
import keyring from '@subwallet/ui-keyring';
import BigN from 'bignumber.js';

jest.setTimeout(100000);

const get = jest.fn();
const set = jest.fn();

global.chrome = {
  storage: {
    // @ts-ignore
    local: {
      set,
      get
    }
  }
};

describe('balance test', () => {
  const substrateChainHandler = new SubstrateChainHandler();
  const evmChainHandler = new EvmChainHandler();

  beforeAll(async () => {
    await cryptoWaitReady();

    keyring.loadAll({ store: new AccountsStore(), type: 'sr25519', password_store: new KeyringStore() });
  });

  it('get balance', async () => {
    const chain = 'polkadot';
    const address = '15aVbh9j99DyEJo9pYDs6UMB25ybHAteb4xmjnXkiBx855Qo';
    const token = 'polkadot-NATIVE-DOT';
    const providerIndex = 2;

    const chainInfo = ChainInfoMap[chain];
    const tokenInfo = ChainAssetMap[token];
    const substrateApi = await substrateChainHandler.initApi(chain, Object.values(chainInfo.providers)[providerIndex]);

    substrateChainHandler.setSubstrateApi(chain, substrateApi);

    await substrateApi.isReady;

    const _ledger = await substrateApi.api.query.staking?.ledger(address);
    const deriveBalancesAll = await substrateApi.api.derive.balances.all(address);

    console.log(deriveBalancesAll);
    console.log(deriveBalancesAll.lockedBreakdown.map((value) => value.toPrimitive()));

    const ledger = _ledger.toPrimitive() as unknown as PalletStakingStakingLedger;
    const balanceItem = await new Promise<BalanceItem>((resolve) => {
      subscribeBalance([address], [chain], [token], ChainAssetMap, ChainInfoMap, substrateChainHandler.getSubstrateApiMap(), evmChainHandler.getEvmApiMap(), (rs) => {
        resolve(rs[0])
      })
    });

    const totalBalance = calculateTotalBalance(balanceItem);
    const lockedBalance = calculateLockedBalance(balanceItem);
    const transferableBalance = calculateTransferableBalance(balanceItem, tokenInfo.minAmount || '0');
    const totalLockedBalance = calculateTotalLockedBalance(balanceItem);
    const stakeableBalance = calculateStakeableBalance(balanceItem, ledger?.total.toString() || '0',tokenInfo.minAmount || '0');

    const { address: _address, state, timestamp, tokenSlug, ...data } = balanceItem;

    const obj = {
      ...data,
      total: totalBalance,
      locked: lockedBalance,
      transferable: transferableBalance,
      totalLocked: totalLockedBalance,
      stakeableBalance: stakeableBalance
    }

    const objDerive = {
      freeBalance: new BigN(deriveBalancesAll.freeBalance.toString()).dividedBy(new BigN(10).pow(tokenInfo.decimals || 0)).toString(),
      reservedBalance: new BigN(deriveBalancesAll.reservedBalance.toString()).dividedBy(new BigN(10).pow(tokenInfo.decimals || 0)).toString(),
      votingBalance: new BigN(deriveBalancesAll.votingBalance.toString()).dividedBy(new BigN(10).pow(tokenInfo.decimals || 0)).toString(),
      availableBalance: new BigN(deriveBalancesAll.availableBalance.toString()).dividedBy(new BigN(10).pow(tokenInfo.decimals || 0)).toString(),
      lockedBalance: new BigN(deriveBalancesAll.lockedBalance.toString()).dividedBy(new BigN(10).pow(tokenInfo.decimals || 0)).toString(),
    }

    console.log(objDerive);

    const rs: Record<string, string> = {};

    Object.entries(obj).forEach(([key, value]) => {
      rs[key] = new BigN(value).dividedBy(new BigN(10).pow(tokenInfo.decimals || 0)).toString();
    });

    console.log(rs);
  });
});
