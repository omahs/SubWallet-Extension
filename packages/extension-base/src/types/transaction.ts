// Copyright 2019-2022 @subwallet/extension-base
// SPDX-License-Identifier: Apache-2.0

import { Transaction as TransactionConfig } from 'web3-types';

import { SubmittableExtrinsic } from '@polkadot/api/types';

export type TransactionData = SubmittableExtrinsic<'promise'> | TransactionConfig;
