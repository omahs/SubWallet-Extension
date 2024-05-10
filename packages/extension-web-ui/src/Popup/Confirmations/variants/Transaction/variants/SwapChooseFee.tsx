// Copyright 2019-2022 @subwallet/extension-web-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { MetaInfo } from '@subwallet/extension-web-ui/components';
import { toShort } from '@subwallet/extension-web-ui/utils';
import CN from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { BaseTransactionConfirmationProps } from './Base';

type Props = BaseTransactionConfirmationProps;

const Component: React.FC<Props> = (props: Props) => {
  const { className, transaction } = props;
  const { t } = useTranslation();

  console.log('transaction', transaction);
  // @ts-ignore
  const data = transaction.data;

  console.log('data', data);

  // console.log('data', data);
  // const recipientAddress = data.recipient || data.address;
  // const account = useGetAccountByAddress(recipientAddress);
  // const networkPrefix = useGetChainPrefixBySlug(transaction.chain);
  //
  // const toAssetInfo = useMemo(() => {
  //   return assetRegistryMap[data.quote.pair.to] || undefined;
  // }, [assetRegistryMap, data.quote.pair.to]);
  // const fromAssetInfo = useMemo(() => {
  //   return assetRegistryMap[data.quote.pair.from] || undefined;
  // }, [assetRegistryMap, data.quote.pair.from]);
  //
  // const estimatedFeeValue = useMemo(() => {
  //   let totalBalance = BN_ZERO;
  //
  //   data.quote.feeInfo.feeComponent.forEach((feeItem) => {
  //     const asset = assetRegistryMap[feeItem.tokenSlug];
  //
  //     if (asset) {
  //       const { decimals, priceId } = asset;
  //       const price = priceMap[priceId || ''] || 0;
  //
  //       totalBalance = totalBalance.plus(new BigN(feeItem.amount).div(BN_TEN.pow(decimals || 0)).multipliedBy(price));
  //     }
  //   });
  //
  //   return totalBalance;
  // }, [assetRegistryMap, data.quote.feeInfo.feeComponent, priceMap]);

  return (
    <>
      <MetaInfo
        className={CN(className)}
        hasBackgroundWrapper={true}
      >
        <MetaInfo.Account
          address={'5EcpBQ1j8qu9vKddfCNwKQTGEd3ALo8h7Nqtc7xbFngsokDr'}
          label={t('Account name')}
          name={'Dung Nguyen'}
          networkPrefix={42}
        />
        <MetaInfo.Default
          className={'address-field'}
          label={t('Address')}
        >
          {toShort('5EcpBQ1j8qu9vKddfCNwKQTGEd3ALo8h7Nqtc7xbFngsokDr')}
        </MetaInfo.Default>
        <MetaInfo.Chain
          chain={'polkadot'}
          label={t('Network')}
        />
      </MetaInfo>
      <MetaInfo
        className={CN(className)}
        hasBackgroundWrapper={true}
      >
        <MetaInfo.Number
          decimals={0}
          label={t('Estimated fee')}
          suffix={'HDX'}
          value={transaction.estimateFee?.value || 0}
        />
      </MetaInfo>
    </>
  );
};

const SwapChooseFeeTransactionConfirmation = styled(Component)<Props>(({ theme: { token } }: Props) => {
  return {
    paddingTop: 10,
    '.__quote-rate-wrapper': {
      display: 'flex'
    },
    '.__swap-arrival-time': {
      marginTop: 12
    },
    '.__swap-quote-expired': {
      marginTop: 12
    },
    '.__summary-to, .__summary-from': {
      display: 'flex',
      alignItems: 'center',
      flexDirection: 'column',
      flex: 1
    },
    '.__quote-footer-label': {
      color: token.colorTextTertiary,
      fontSize: 12,
      fontWeight: token.bodyFontWeight,
      lineHeight: token.lineHeightSM
    },
    '.__amount-destination': {
      color: token.colorTextLight2,
      fontSize: token.fontSizeLG,
      fontWeight: token.fontWeightStrong,
      lineHeight: token.lineHeightLG
    },
    '.__recipient-item .__label': {
      fontSize: 14,
      color: token.colorTextTertiary,
      fontWeight: token.fontWeightStrong,
      lineHeight: token.lineHeight
    },
    '.__recipient-item .__account-name': {
      fontSize: 14,
      color: token.colorWhite,
      fontWeight: token.bodyFontWeight,
      lineHeight: token.lineHeight
    },
    '.__quote-rate-confirm .__value': {
      fontSize: 14,
      color: token.colorWhite,
      fontWeight: token.bodyFontWeight,
      lineHeight: token.lineHeight
    },
    '.__estimate-transaction-fee .__value': {
      fontSize: 14,
      color: token.colorWhite,
      fontWeight: token.bodyFontWeight,
      lineHeight: token.lineHeight
    },
    '.__quote-rate-confirm.__quote-rate-confirm, .__estimate-transaction-fee.__estimate-transaction-fee, .-d-column.-d-column': {
      marginTop: 12
    },
    '.__swap-route-container': {
      marginBottom: 20
    },
    '.__quote-rate-confirm .__label': {
      fontSize: 14,
      color: token.colorTextTertiary,
      fontWeight: token.bodyFontWeight,
      lineHeight: token.lineHeight
    },
    '.__estimate-transaction-fee .__label': {
      fontSize: 14,
      color: token.colorTextTertiary,
      fontWeight: token.bodyFontWeight,
      lineHeight: token.lineHeight
    },
    '.-d-column .__label': {
      fontSize: 14,
      color: token.colorTextTertiary,
      fontWeight: token.bodyFontWeight,
      lineHeight: token.lineHeight
    }
  };
});

export default SwapChooseFeeTransactionConfirmation;
