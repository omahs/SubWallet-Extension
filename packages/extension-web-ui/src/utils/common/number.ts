// Copyright 2019-2022 @subwallet/extension-web-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { AmountData, EvmSendTransactionRequest } from '@subwallet/extension-base/background/KoniTypes';
import { balanceFormatter, formatNumber } from '@subwallet/react-ui';
import BigN from 'bignumber.js';

export const formatBalance = (value: string | number | BigN, decimals: number) => {
  return formatNumber(value, decimals, balanceFormatter);
};

export const formatAmount = (amountData?: AmountData): string => {
  if (!amountData) {
    return '';
  }

  const { decimals, symbol, value } = amountData;
  const displayValue = formatBalance(value, decimals);

  return `${displayValue} ${symbol}`;
};

export const convertToBigN = (num: EvmSendTransactionRequest['value']): string | number | undefined => {
  if (typeof num === 'string') {
    return new BigN(num).toNumber();
  } else if (typeof num === 'undefined') {
    return num;
  } else {
    return Number(num);
  }
};
