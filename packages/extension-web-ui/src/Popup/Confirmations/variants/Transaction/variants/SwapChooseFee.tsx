// Copyright 2019-2022 @subwallet/extension-web-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { MetaInfo } from '@subwallet/extension-web-ui/components';
import CN from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { BaseTransactionConfirmationProps } from './Base';

type Props = BaseTransactionConfirmationProps;

const Component: React.FC<Props> = (props: Props) => {
  const { className } = props;
  const { t } = useTranslation();
  // const assetRegistryMap = useSelector((state) => state.assetRegistry.assetRegistry);
  // const priceMap = useSelector((state) => state.price.priceMap);
  // @ts-ignore
  // const data = transaction.data;

  // TODO: Convert fee to dollar.
  // const convertedBalanceValue = useMemo(() => {
  //   let totalBalance = BN_ZERO;
  //
  //   const asset = assetRegistryMap[feeItem.tokenSlug];
  //
  //   if (asset) {
  //     const { decimals, priceId } = asset;
  //     const price = priceMap[priceId || ''] || 0;
  //
  //     totalBalance = totalBalance.plus(new BigN(feeItem.amount).div(BN_TEN.pow(decimals || 0)).multipliedBy(price));
  //   }
  //
  //   return totalBalance;
  // }, [assetRegistryMap, data.quote.feeInfo.feeComponent, priceMap]);

  return (
    <>
      <div className={CN(className)}>
        {/* // TODO: Depends on the data, will the component be displayed or not? */}
        {/* <SwapTransactionBlock */}
        {/*  data={data} */}
        {/* /> */}
        <MetaInfo
          hasBackgroundWrapper={true}
        >
          <MetaInfo.Chain
            chain={'polkadot'}
            label={t('Network')}
          />
          <MetaInfo.Default
            className={'__token-network-fee'}
            label={t('Token for paying Network fee')}
            valueColorSchema={'default'}
          >
          DOT
          </MetaInfo.Default>
          <MetaInfo.Number
            decimals={0}
            label={t('Estimated network fee')}
            prefix={'$'}
            value={'100'}
          />
          <MetaInfo.Number
            className={'__convert-fee-value'}
            decimals={0}
            prefix={'~'}
            suffix={'DOT'}
            value={'20'}
          />
        </MetaInfo>
      </div>
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
    '.__convert-fee-value.__row': {
      marginTop: 0
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
