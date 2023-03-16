// Copyright 2019-2022 @subwallet/extension-koni-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Layout, PageWrapper } from '@subwallet/extension-koni-ui/components';
import { AddressInput } from '@subwallet/extension-koni-ui/components/Field/AddressInput';
import useCompleteCreateAccount from '@subwallet/extension-koni-ui/hooks/account/useCompleteCreateAccount';
import useGetDefaultAccountName from '@subwallet/extension-koni-ui/hooks/account/useGetDefaultAccountName';
import useFocusById from '@subwallet/extension-koni-ui/hooks/form/useFocusById';
import useAutoNavigateToCreatePassword from '@subwallet/extension-koni-ui/hooks/router/autoNavigateToCreatePassword';
import { createAccountExternalV2 } from '@subwallet/extension-koni-ui/messaging';
import { RootState } from '@subwallet/extension-koni-ui/stores';
import { ThemeProps } from '@subwallet/extension-koni-ui/types';
import { ValidateState } from '@subwallet/extension-koni-ui/types/validator';
import { convertFieldToObject } from '@subwallet/extension-koni-ui/util/form';
import { readOnlyScan } from '@subwallet/extension-koni-ui/util/scanner/attach';
import { Form, Icon } from '@subwallet/react-ui';
import { useForm } from '@subwallet/react-ui/es/form/Form';
import PageIcon from '@subwallet/react-ui/es/page-icon';
import CN from 'classnames';
import { Eye, Info } from 'phosphor-react';
import { Callbacks, FieldData, RuleObject } from 'rc-field-form/lib/interface';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import styled from 'styled-components';

type Props = ThemeProps;

interface ReadOnlyAccountInput {
  address?: string;
}

const FooterIcon = (
  <Icon
    phosphorIcon={Eye}
    weight='fill'
  />
);

const modalId = 'attach-read-only-scanner-modal';

const Component: React.FC<Props> = ({ className }: Props) => {
  useAutoNavigateToCreatePassword();

  const { t } = useTranslation();
  const onComplete = useCompleteCreateAccount();

  const [reformatAddress, setReformatAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEthereum, setIsEthereum] = useState(false);
  const [validateState, setValidateState] = useState<ValidateState>({});
  const accountName = useGetDefaultAccountName();
  const [form] = useForm<ReadOnlyAccountInput>();
  const accounts = useSelector((root: RootState) => root.accountState.accounts);

  const handleResult = useCallback((val: string) => {
    const result = readOnlyScan(val);

    if (result) {
      setReformatAddress(result.content);
      setIsEthereum(result.isEthereum);
    }
  }, []);

  const onFieldsChange: Callbacks<ReadOnlyAccountInput>['onFieldsChange'] = useCallback((changes: FieldData[], formData: FieldData[]) => {
    const changeMap = convertFieldToObject<ReadOnlyAccountInput>(changes);

    if (changeMap.address) {
      setValidateState({});
      handleResult(changeMap.address);
    }
  }, [handleResult]);

  const accountAddressValidator = useCallback((rule: RuleObject, value: string) => {
    const result = readOnlyScan(value);

    if (result) {
      // For each account, check if the address already exists return promise reject
      for (const account of accounts) {
        if (account.address === result.content) {
          setReformatAddress('');

          return Promise.reject(t('Account already exists'));
        }
      }
    } else {
      setReformatAddress('');

      if (value !== '') {
        return Promise.reject(t('Invalid address'));
      }
    }

    return Promise.resolve();
  }, [accounts, t]);

  const onSubmit = useCallback(() => {
    setLoading(true);

    if (reformatAddress) {
      createAccountExternalV2({
        name: accountName,
        address: reformatAddress,
        genesisHash: '',
        isEthereum: isEthereum,
        isAllowed: false,
        isReadOnly: true
      })
        .then((errors) => {
          if (errors.length) {
            setValidateState({
              message: errors[0].message,
              status: 'error'
            });
          } else {
            setValidateState({});
            onComplete();
          }
        })
        .catch((error: Error) => {
          setValidateState({
            message: error.message,
            status: 'error'
          });
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [reformatAddress, accountName, isEthereum, onComplete]);

  useFocusById(modalId);

  const isFormValidated = form.getFieldsError().filter(({ errors }) => errors.length).length > 0;

  return (
    <PageWrapper className={CN(className)}>
      <Layout.WithSubHeaderOnly
        rightFooterButton={{
          children: t('Attach read-only account'),
          icon: FooterIcon,
          disabled: !reformatAddress || !!validateState.status || isFormValidated,
          onClick: onSubmit,
          loading: loading
        }}
        subHeaderIcons={[
          {
            icon: (
              <Icon
                phosphorIcon={Info}
                size='md'
              />
            )
          }
        ]}
        title={t<string>('Attach watch-only account')}
      >
        <div className={CN('container')}>
          <div className='description'>
            {t('Track the activity of any wallet without injecting your private key to SubWallet')}
          </div>
          <div className='page-icon'>
            <PageIcon
              color='var(--page-icon-color)'
              iconProps={{
                weight: 'fill',
                phosphorIcon: Eye
              }}
            />
          </div>
          <Form
            form={form}
            initialValues={{ address: '' }}
            onFieldsChange={onFieldsChange}
            onFinish={onSubmit}
          >
            <Form.Item
              name={'address'}
              rules={[
                {
                  message: t('Account address is required'),
                  required: true
                },
                {
                  validator: accountAddressValidator
                }
              ]}
            >
              <AddressInput
                id={modalId}
                placeholder={t('Please type or paste account address')}
                showScanner={true}
              />
            </Form.Item>
            <Form.Item
              help={validateState.message}
              validateStatus={validateState.status}
            />
          </Form>
        </div>
      </Layout.WithSubHeaderOnly>
    </PageWrapper>
  );
};

const AttachReadOnly = styled(Component)<Props>(({ theme: { token } }: Props) => {
  return {
    '.container': {
      padding: token.padding
    },

    '.description': {
      padding: `0 ${token.padding}px`,
      fontSize: token.fontSizeHeading6,
      lineHeight: token.lineHeightHeading6,
      color: token.colorTextDescription,
      textAlign: 'center'
    },

    '.page-icon': {
      display: 'flex',
      justifyContent: 'center',
      marginTop: token.controlHeightLG,
      marginBottom: token.sizeXXL,
      '--page-icon-color': token.colorSecondary
    }
  };
});

export default AttachReadOnly;
