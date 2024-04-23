// Copyright 2019-2022 @subwallet/extension-base
// SPDX-License-Identifier: Apache-2.0

import { BalanceItem } from '@subwallet/extension-base/types';
import { BN_ZERO } from '@subwallet/extension-base/utils';
import BigN from 'bignumber.js';

export const calculateLockedBalance = (balance: BalanceItem): string => {
  const reserved = new BigN(balance.reserved || '0');
  const frozen = new BigN(balance.frozen || '0');
  const locked = BigN.max(frozen.minus(reserved), BN_ZERO);

  return locked.toString();
};

export const calculateTotalLockedBalance = (balance: BalanceItem): string => {
  const _locked = calculateLockedBalance(balance);
  const locked = new BigN(_locked);
  const pooled = new BigN(balance.pooled || '0');

  return locked.plus(pooled).toString();
};

export const calculateTotalBalance = (balance: BalanceItem): string => {
  const reserved = new BigN(balance.reserved || '0');
  const free = new BigN(balance.free || '0');
  const pooled = new BigN(balance.pooled || '0');

  return BigN.sum(reserved, free, pooled).toString();
};

export const calculateTransferableBalance = (balance: BalanceItem, existentialDeposit: string): string => {
  const _locked = calculateLockedBalance(balance);
  const locked = new BigN(_locked);
  const free = new BigN(balance.free || '0');
  const existential = new BigN(existentialDeposit || '0');
  const cannotTransfer = BigN.max(locked, existential);

  return BigN.max(free.minus(cannotTransfer), BN_ZERO).toString();
};

export const calculateStakeableBalance = (balance: BalanceItem, staked: string, existentialDeposit: string): string => {
  const _locked = calculateLockedBalance(balance);
  const locked = new BigN(_locked);
  const notStakeLocked = BigN.max(locked.minus(staked), BN_ZERO);
  const existential = new BigN(existentialDeposit || '0');
  const free = new BigN(balance.free || '0');
  const cannotStaked = BigN.max(notStakeLocked, existential);

  return BigN.max(free.minus(cannotStaked), BN_ZERO).toString();
};
