// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { _ChainConnectionStatus } from '@subwallet/extension-base/services/chain-service/types';

export const DefaultLogosMap: Record<string, string> = {
  subwallet: './images/projects/subwallet.png',
  parity: './images/projects/parity.png',
  keystone: './images/projects/keystone.png',
  ledger: './images/projects/ledger.png',
  default: './images/subwallet/default.png',
  transak: './images/projects/transak.png',
  moonpay: './images/projects/moonpay.png',
  onramper: './images/projects/onramper.png',
  polkadot_vault: './images/projects/polkadot-vault.png',
  walletconnect: './images/projects/walletconnect.png',
  banxa: './images/projects/banxa.png',
  coinbase: './images/projects/coinbase.png',
  stellaswap: './images/projects/stellaswap.png',
  xtwitter: './images/projects/xtwitter.png',
  xtwitter_transparent: './images/projects/xtwitter_transparent.png',
  chain_flip: '/images/projects/chainflip-mainnet.png',
  hydradx: '/images/projects/hydradx.png',
  currency_brl: '/images/projects/CurrencyBRL.png',
  currency_cny: '/images/projects/CurrencyCNY.png',
  currency_hkd: '/images/projects/CurrencyHKD.png',
  currency_vnd: '/images/projects/CurrencyVND.png'
};

export const IconMap = {
  __CONNECTED__: './images/icons/__connected__.png',
  __CONNECTING__: './images/icons/__connecting__.png',
  __UNSTABLE__: './images/icons/__unstable__.png',
  __DISCONNECTED__: './images/icons/__disconnected__.png',
  __qr_code__: './images/icons/__qr_code__.png'
};

export default DefaultLogosMap;
