// Copyright 2019-2022 @polkadot/extension-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ThemeProps } from '@subwallet/extension-koni-ui/types';
import { BalanceItemProps, Number } from '@subwallet/react-ui';
import classNames from 'classnames';
import React, { useContext } from 'react';
import styled, { ThemeContext } from 'styled-components';

type Props = ThemeProps & {
  onPressItem?: BalanceItemProps['onPressItem'],
  value: number,
  pastValue: number,
  priceChangeStatus?: string,
};

function Component (
  { className = '',
    pastValue,
    priceChangeStatus,
    value }: Props) {
  // todo: Update BalanceItem in react-ui lib
  // - loading
  // - auto detect logo, only use logoKey
  // - price change status

  const { token } = useContext(ThemeContext);

  const marginColor = priceChangeStatus === 'increase' ? token.colorSuccess : token.colorError;
  const margin = !pastValue || !value ? 0 : Math.abs(pastValue - value) / pastValue * 100;

  return (
    <div className={classNames('token-price', className, {
      '-price-decrease': priceChangeStatus === 'decrease'
    })}
    >
      <Number
        decimal={0}
        decimalOpacity={0.45}
        prefix={'$'}
        value={value}
      />
      <Number
        className='margin-percentage'
        decimal={0}
        decimalColor={marginColor}
        intColor={marginColor}
        prefix={priceChangeStatus === 'decrease' ? '-' : '+'}
        size={12}
        suffix='%'
        unitColor={marginColor}
        value={margin}
      />
    </div>
  );
}

export const TokenPrice = styled(Component)<Props>(({ theme: { token } }: Props) => {
  return ({
    '.ant-number': {
      fontSize: 'inherit !important',
      lineHeight: 'inherit',
      textAlign: 'end'
    },

    '.margin-percentage': {
      fontSize: token.fontSizeSM
    }
  });
});
