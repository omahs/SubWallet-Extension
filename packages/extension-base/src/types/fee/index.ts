// Copyright 2019-2022 @subwallet/extension-base
// SPDX-License-Identifier: Apache-2.0

import BigN from 'bignumber.js';

interface BaseFeeInfo {
  // blockNumber: string;
  busyNetwork: boolean;
}

export interface EvmLegacyFeeInfo extends BaseFeeInfo {
  gasPrice: string;
  baseGasFee: undefined;
  options: undefined
}

export interface EvmEIP1995FeeOption {
  maxFeePerGas: BigN;
  maxPriorityFeePerGas: BigN;
}

export type EvmEIP1995FeeDefault = 'slow' | 'average' | 'fast';

export interface EvmEIP1995FeeInfo extends BaseFeeInfo {
  gasPrice: undefined;
  baseGasFee: BigN;
  options: {
    slow: EvmEIP1995FeeOption;
    average: EvmEIP1995FeeOption;
    fast: EvmEIP1995FeeOption;
    default: EvmEIP1995FeeDefault;
  }
}

export type EvmFeeInfo = EvmLegacyFeeInfo | EvmEIP1995FeeInfo;

export interface EvmLegacyFeeInfoCache extends BaseFeeInfo {
  gasPrice: string;
  options: undefined;
  baseGasFee: undefined;
}

export interface EvmEIP1995FeeCacheOption {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

export interface EvmEIP1995FeeInfoCache extends BaseFeeInfo {
  gasPrice: undefined;
  baseGasFee: string;
  options: {
    slow: EvmEIP1995FeeCacheOption;
    average: EvmEIP1995FeeCacheOption;
    fast: EvmEIP1995FeeCacheOption;
    default: EvmEIP1995FeeDefault;
  }
}

export type EvmFeeInfoCache = EvmLegacyFeeInfoCache | EvmEIP1995FeeInfoCache;

export interface InfuraFeeDetail {
  suggestedMaxPriorityFeePerGas: string; // in gwei
  suggestedMaxFeePerGas: string; // in gwei
  minWaitTimeEstimate: number;
  maxWaitTimeEstimate: number;
}

export interface InfuraFeeInfo {
  low: InfuraFeeDetail;
  medium: InfuraFeeDetail;
  high: InfuraFeeDetail;
  networkCongestion: number;
  estimatedBaseFee: string;
  latestPriorityFeeRange: [string, string];
  historicalPriorityFeeRange: [string, string];
  historicalBaseFeeRange: [string, string];
  priorityFeeTrend: 'down' | 'up';
  baseFeeTrend: 'down' | 'up';
}

export interface InfuraThresholdInfo {
  busyThreshold: string; // in gwei
}

export interface EvmFeeOption {
  evm?: EvmFeeInfoCache;
}
