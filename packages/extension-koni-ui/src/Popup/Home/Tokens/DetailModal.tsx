// Copyright 2019-2022 @polkadot/extension-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { APIItemState } from '@subwallet/extension-base/background/KoniTypes';
import { BalanceItem } from '@subwallet/extension-base/types';
import { isSameAddress } from '@subwallet/extension-base/utils';
import { AccountTokenBalanceItem, RadioGroup } from '@subwallet/extension-koni-ui/components';
import { useSelector } from '@subwallet/extension-koni-ui/hooks';
import useTranslation from '@subwallet/extension-koni-ui/hooks/common/useTranslation';
import { ThemeProps } from '@subwallet/extension-koni-ui/types';
import { TokenBalanceItemType } from '@subwallet/extension-koni-ui/types/balance';
import { isAccountAll } from '@subwallet/extension-koni-ui/utils';
import { Form, ModalContext, Number, SwModal } from '@subwallet/react-ui';
import BigN from 'bignumber.js';
import React, { useContext, useEffect, useMemo } from 'react';
import styled from 'styled-components';

type Props = ThemeProps & {
  id: string,
  onCancel: () => void,
  tokenBalanceMap: Record<string, TokenBalanceItemType>,
  currentTokenInfo?: {
    symbol: string;
    slug: string;
  }
}

type ItemType = {
  symbol: string,
  label: string,
  key: string,
  value: BigN
}

enum ViewValue {
  OVERVIEW = 'Overview',
  DETAIL = 'Detail'
}

interface ViewOption {
  label: string;
  value: ViewValue;
}

interface FormState {
  view: ViewValue
}

function Component ({ className = '', currentTokenInfo, id, onCancel, tokenBalanceMap }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  const { checkActive } = useContext(ModalContext);

  const isActive = checkActive(id);

  const { currentAccount, isAllAccount } = useSelector((state) => state.accountState);
  const { balanceMap } = useSelector((state) => state.balance);

  const [form] = Form.useForm<FormState>();

  const view = Form.useWatch('view', form);

  const defaultValues = useMemo((): FormState => ({
    view: ViewValue.OVERVIEW
  }), []);

  const viewOptions = useMemo((): ViewOption[] => {
    return [
      {
        label: t('Token Details'),
        value: ViewValue.OVERVIEW
      },
      {
        label: t('Account Details'),
        value: ViewValue.DETAIL
      }
    ];
  }, [t]);

  const items = useMemo((): ItemType[] => {
    const symbol = currentTokenInfo?.symbol || '';
    const balanceInfo = currentTokenInfo ? tokenBalanceMap[currentTokenInfo.slug] : undefined;

    const result: ItemType[] = [];

    result.push({
      key: 'transferable',
      symbol,
      label: t('Transferable'),
      value: balanceInfo ? balanceInfo.free.value : new BigN(0)
    });

    result.push({
      key: 'locked',
      symbol,
      label: t('Locked'),
      value: balanceInfo ? balanceInfo.locked.value : new BigN(0)
    });

    return result;
  }, [currentTokenInfo, t, tokenBalanceMap]);

  const accountItems = useMemo((): BalanceItem[] => {
    if (!currentTokenInfo?.slug) {
      return [];
    }

    const result: BalanceItem[] = [];

    const filterAddress = (address: string) => {
      if (isAllAccount) {
        return !isAccountAll(address);
      } else {
        return isSameAddress(address, currentAccount?.address || '');
      }
    };

    for (const [address, info] of Object.entries(balanceMap)) {
      if (filterAddress(address)) {
        const item = info[currentTokenInfo.slug];

        if (item && item.state === APIItemState.READY) {
          result.push(item);
        }
      }
    }

    return result;
  }, [balanceMap, currentAccount?.address, currentTokenInfo?.slug, isAllAccount]);

  useEffect(() => {
    if (!isActive) {
      form?.resetFields();
    }
  }, [form, isActive]);

  return (
    <SwModal
      className={className}
      id={id}
      onCancel={onCancel}
      title={t('Token details')}
    >
      <Form
        form={form}
        initialValues={defaultValues}
        name='token-detail-form'
      >
        <Form.Item
          hidden={!isAllAccount}
          name='view'
        >
          <RadioGroup
            optionType='button'
            options={viewOptions}
          />
        </Form.Item>
      </Form>
      {
        view === ViewValue.OVERVIEW && (
          <div className={'__container'}>
            {items.map((item) => (
              <div
                className={'__row'}
                key={item.key}
              >
                <div className={'__label'}>{item.label}</div>

                <Number
                  className={'__value'}
                  decimal={0}
                  decimalOpacity={0.45}
                  intOpacity={0.85}
                  size={14}
                  suffix={item.symbol}
                  unitOpacity={0.85}
                  value={item.value}
                />
              </div>
            ))}
          </div>
        )
      }
      {
        view === ViewValue.DETAIL && (
          <>
            {accountItems.map((item) => (
              <AccountTokenBalanceItem
                item={item}
                key={item.address}
              />
            ))}
          </>
        )
      }
    </SwModal>
  );
}

export const DetailModal = styled(Component)<Props>(({ theme: { token } }: Props) => {
  return ({
    '.__container': {
      borderRadius: token.borderRadiusLG,
      backgroundColor: token.colorBgSecondary,
      padding: '12px 12px 4px'
    },

    '.__row': {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: token.marginSM
    },

    '.__label': {
      paddingRight: token.paddingSM
    }
  });
});
