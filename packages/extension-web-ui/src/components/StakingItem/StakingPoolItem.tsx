// Copyright 2019-2022 @subwallet/extension-web-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Theme } from '@subwallet/extension-web-ui/themes';
import { NominationPoolDataType, ThemeProps } from '@subwallet/extension-web-ui/types';
import { Button, Icon, Number, Web3Block } from '@subwallet/react-ui';
import SwAvatar from '@subwallet/react-ui/es/sw-avatar';
import CN from 'classnames';
import { DotsThree, ThumbsUp } from 'phosphor-react';
import React, { Context, SyntheticEvent, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import styled, { ThemeContext } from 'styled-components';

import { isEthereumAddress } from '@polkadot/util-crypto';

type Props = NominationPoolDataType & ThemeProps & {
  onClickMoreBtn: (e: SyntheticEvent) => void;
}

const Component: React.FC<Props> = (props: Props) => {
  const { address, bondedAmount, className, decimals, id, isProfitable, name, onClickMoreBtn, symbol } = props;
  const token = useContext<Theme>(ThemeContext as Context<Theme>).token;
  const { t } = useTranslation();

  return (
    <Web3Block
      className={className}
      leftItem={
        <SwAvatar
          identPrefix={42}
          size={40}
          theme={isEthereumAddress(address) ? 'ethereum' : 'polkadot'}
          value={address}
        />
      }
      middleItem={
        <div className={'middle-item'}>
          <div className={'middle-item__name'}>
            {name?.includes('SubWallet')
              ? (
                <>
                  {name}
                  <div className={'__tag-wrapper'}>
                    <Icon
                      customSize={'12px'}
                      iconColor={token.colorSuccess}
                      phosphorIcon={ThumbsUp}
                      weight={'fill'}
                    />
                    <div className={'__tag-title'}>Recommended</div>
                  </div>
                </>
              )
              : (
                <span>{name || `Pool #${id}`}</span>
              )}
          </div>
          <div className={'middle-item__bond-amount'}>
            <span className={'middle-item__bond-amount-label'}>{t('Staked:')}</span>
            <Number
              className={'middle-item__bond-amount-number'}
              decimal={decimals}
              decimalOpacity={0.45}
              intOpacity={0.45}
              size={12}
              suffix={symbol}
              unitOpacity={0.45}
              value={bondedAmount}
            />
            <span className={CN('middle-item__pool-earning-status', { not: !isProfitable })}>
              <span className='separator'>
                &nbsp;-&nbsp;
              </span>
              <span>
                {isProfitable ? t('Earning') : t('Not earning')}
              </span>
            </span>
          </div>
        </div>
      }

      rightItem={
        <Button
          icon={
            <Icon phosphorIcon={DotsThree} />
          }
          onClick={onClickMoreBtn}
          size='xs'
          type='ghost'
        />
      }
    />
  );
};

const StakingPoolItem = styled(Component)<Props>(({ theme: { token } }: Props) => {
  return {
    padding: token.paddingSM,
    borderRadius: token.borderRadiusLG,
    background: token.colorBgSecondary,

    '.ant-web3-block-middle-item': {
      paddingRight: token.paddingXXS
    },

    '.middle-item__name': {
      fontSize: token.fontSizeLG,
      lineHeight: token.lineHeightLG,
      textOverflow: 'ellipsis',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      display: 'flex',
      alignItems: 'center',
      gap: 4
    },
    '.__tag-wrapper': {
      textAlign: 'center',
      backgroundColor: 'rgba(76, 234, 172, 0.1)',
      display: 'flex',
      gap: 4,
      borderRadius: token.borderRadiusLG,
      paddingLeft: token.paddingXS,
      paddingRight: token.paddingXS,
      paddingBottom: 2,
      paddingTop: 2,
      overflow: 'hidden'
    },
    '.__tag-title': {
      fontSize: token.fontSizeXS,
      fontWeight: 700,
      lineHeight: token.lineHeightXS,
      color: token.colorSuccess,
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    },

    '.middle-item__bond-amount-label, .middle-item__bond-amount-number, .middle-item__pool-earning-status': {
      fontSize: token.fontSizeSM,
      lineHeight: token.lineHeightSM,
      color: token.colorTextLight4
    },

    '.middle-item__bond-amount-number, .middle-item__pool-earning-status': {
      textWrap: 'nowrap'
    },

    '.middle-item__pool-earning-status': {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      color: token.colorSuccess,

      '&.not': {
        color: token.colorError
      },

      '.separator': {
        color: token.colorTextLight4
      }
    },

    '.middle-item__bond-amount-label': {
      paddingRight: token.paddingXXS
    },

    '.middle-item__bond-amount': {
      display: 'flex',
      alignItems: 'center'
    }
  };
});

export default StakingPoolItem;
