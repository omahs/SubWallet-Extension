// Copyright 2019-2022 @polkadot/extension-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ChainRegistry,
  DropdownTransformOptionType,
  NetworkJson
} from '@subwallet/extension-base/background/KoniTypes';
import { SupportedCrossChainsMap } from '@subwallet/extension-koni-base/api/supportedCrossChains';
import {AccountContext, Button, Warning} from '@subwallet/extension-koni-ui/components';
import InputBalance from '@subwallet/extension-koni-ui/components/InputBalance';
import LoadingContainer from '@subwallet/extension-koni-ui/components/LoadingContainer';
import ReceiverInputAddress from '@subwallet/extension-koni-ui/components/ReceiverInputAddress';
import { useTranslation } from '@subwallet/extension-koni-ui/components/translate';
import { BalanceFormatType, SenderInputAddressType } from '@subwallet/extension-koni-ui/components/types';
import useFreeBalance from '@subwallet/extension-koni-ui/hooks/screen/sending/useFreeBalance';
import Header from '@subwallet/extension-koni-ui/partials/Header';
import AuthTransaction from '@subwallet/extension-koni-ui/Popup/XcmTransfer/AuthTransaction';
import BridgeInputAddress from '@subwallet/extension-koni-ui/Popup/XcmTransfer/BridgeInputAddress';
import Dropdown from '@subwallet/extension-koni-ui/Popup/XcmTransfer/XcmDropdown/Dropdown';
import {
  getAuthTransactionFeeInfo,
  getBalanceFormat,
  getDefaultAddress, getMainTokenInfo
} from '@subwallet/extension-koni-ui/Popup/Sending/utils';
import { RootState } from '@subwallet/extension-koni-ui/stores';
import { ThemeProps } from '@subwallet/extension-koni-ui/types';
import React, {useCallback, useContext, useEffect, useState} from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';

import { BN, BN_ZERO } from '@polkadot/util';

import arrowRight from '../../assets/arrow-right.svg';
import {checkCrossChainTransfer} from "@subwallet/extension-koni-ui/messaging";
import {isEthereumAddress} from "@polkadot/util-crypto";

interface Props extends ThemeProps {
  className?: string,
}

interface ContentProps extends ThemeProps {
  className?: string;
  defaultValue: SenderInputAddressType;
  networkMap: Record<string, NetworkJson>;
  chainRegistryMap: Record<string, ChainRegistry>;
  originChainOptions: DropdownTransformOptionType[];
  destinationChainOptions: DropdownTransformOptionType[];
}

function Wrapper ({ className = '', theme }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { accounts } = useContext(AccountContext);
  const { chainRegistry: chainRegistryMap,
    currentAccount: { account },
    networkMap } = useSelector((state: RootState) => state);
  const originChainOptions = Object.keys(SupportedCrossChainsMap).map((key) => ({ label: networkMap[key].chain, value: key }));
  const firstOriginChain = originChainOptions[0].value;
  const destinationChainOptions = Object.keys(SupportedCrossChainsMap[firstOriginChain].relationMap).map((key) => ({ label: networkMap[key].chain, value: key }));
  let defaultValue;
  if (account) {
    defaultValue = {
      address: getDefaultAddress(account.address, accounts),
      networkKey: firstOriginChain,
      token: SupportedCrossChainsMap[firstOriginChain].relationMap[destinationChainOptions[0].value].supportedToken[0]
    };
  } else {
    defaultValue = null;
  }


  return (
    <div className={className}>
      <Header
        isShowNetworkSelect={false}
        showAdd
        showCancelButton
        showSearch
        showSettings
        showSubHeader
        subHeaderName={t<string>('XCM Transfer')}
      />
      {accounts && accounts.length && account && defaultValue
        ? (
          <XcmTransfer
            chainRegistryMap={chainRegistryMap}
            className='bridge-container'
            defaultValue={defaultValue}
            networkMap={networkMap}
            originChainOptions={originChainOptions}
            destinationChainOptions={destinationChainOptions}
            theme={theme}
          />
        )
        : (<LoadingContainer />)
      }
    </div>
  );
}

function XcmTransfer ({ chainRegistryMap, className, defaultValue, networkMap, destinationChainOptions, originChainOptions }: ContentProps): React.ReactElement {
  const { t } = useTranslation();
  const [isShowTxModal, setShowTxModal] = useState<boolean>(false);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [amount, setAmount] = useState<BN | undefined>(BN_ZERO);
  const [{ address: senderId,
    networkKey: selectedNetworkKey,
    token: selectedToken }, setSenderValue] = useState<SenderInputAddressType>(defaultValue);
  const [[fee, feeSymbol, errors], setFeeInfo] = useState<[string | null, string | null | undefined, string[]]>([null, null, []]);
  const senderFreeBalance = useFreeBalance(selectedNetworkKey, senderId, selectedToken);
  const recipientFreeBalance = useFreeBalance(selectedNetworkKey, recipientId, selectedToken);
  const balanceFormat: BalanceFormatType | null = chainRegistryMap[selectedNetworkKey] || networkMap[selectedNetworkKey].active ?
    getBalanceFormat(selectedNetworkKey, selectedToken, chainRegistryMap) : null;
  const mainTokenInfo = chainRegistryMap[selectedNetworkKey] || networkMap[selectedNetworkKey].active ? getMainTokenInfo(selectedNetworkKey, chainRegistryMap) : null;
  const feeDecimal: number | null = feeSymbol && (chainRegistryMap[selectedNetworkKey] || networkMap[selectedNetworkKey].active)
    ? feeSymbol === selectedToken && balanceFormat
      ? balanceFormat[0]
      : getBalanceFormat(selectedNetworkKey, feeSymbol, chainRegistryMap)[0]
    : null;
  const valueToTransfer = amount?.toString() || '0';
  const [originChain, setOriginChain] = useState<string>(originChainOptions[0].value);
  const [destinationChain, setDestinationChain] = useState<string>(destinationChainOptions[0].value);
  const tokenList = SupportedCrossChainsMap[originChain].relationMap[destinationChain].supportedToken.map((token) => (
    {
      label: token,
      value: token,
      networkKey: originChain,
      networkName: networkMap[originChain].chain
    }
  ));

  useEffect(() => {
    let isSync = true;

    if (recipientId) {
      checkCrossChainTransfer({
        originalNetworkKey: originChain,
        destinationNetworkKey: destinationChain,
        from: senderId,
        to: recipientId,
        token: selectedToken,
        value: valueToTransfer
      }).then((value) => {
        if (isSync) {
          if (value.errors && value.errors.length) {
            if (value.estimateFee) {
              setFeeInfo([value.estimateFee, value.feeSymbol, value.errors.map((err) => err.message)]);
            } else {
              setFeeInfo([null, value.feeSymbol, value.errors.map((err) => err.message)]);
            }
          } else {
            setFeeInfo([null, value.feeSymbol, []]);
          }
        }
      }).catch(console.error);
    }

    return () => {
      isSync = false;
    };
  }, [recipientId, valueToTransfer, selectedToken, recipientId, senderId, destinationChain, originChain]);

  const _onCancel = useCallback(() => {}, []);
  const _onTransfer = useCallback(() => {
    setShowTxModal(true);
  }, []);

  const _onChangeResult = useCallback(() => {}, []);

  const _onCancelTx = useCallback(() => {
    setShowTxModal(false);
  }, []);

  const renderError = () => {
    return errors.map((err) =>
      (
        <Warning
          className='auth-transaction-error'
          isDanger
          key={err}
        >
          {t<string>(err)}
        </Warning>
      )
    );
  };

  return (
    <>
      <div className={className}>
        <div className='bridge__chain-selector-area'>
          <Dropdown
            className='bridge__chain-selector'
            isDisabled={false}
            label={'Original Chain'}
            onChange={setOriginChain}
            options={originChainOptions}
            value={originChain}
          />

          <div className='bridge__chain-swap'>
            <img
              alt='Icon'
              src={arrowRight}
            />
          </div>

          <Dropdown
            className='bridge__chain-selector'
            isDisabled={false}
            label={'Destination Chain'}
            onChange={setDestinationChain}
            options={destinationChainOptions}
            value={destinationChain}
          />
        </div>

        {!!balanceFormat ?
          <>
            <BridgeInputAddress
              balance={senderFreeBalance}
              chainRegistryMap={chainRegistryMap}
              balanceFormat={balanceFormat}
              className=''
              initValue={defaultValue}
              networkMap={networkMap}
              onChange={setSenderValue}
              options={tokenList}
            />

            <ReceiverInputAddress
              balance={recipientFreeBalance}
              balanceFormat={balanceFormat}
              className={''}
              networkKey={selectedNetworkKey}
              networkMap={networkMap}
              onchange={setRecipientId}
            />

            <InputBalance
              autoFocus
              className={'bridge-amount-input'}
              decimals={balanceFormat[0]}
              help={t<string>('Type the amount you want to transfer. Note that you can select the unit on the right e.g sending 1 milli is equivalent to sending 0.001.')}
              isError={false}
              isZeroable
              label={t<string>('amount')}
              onChange={setAmount}
              placeholder={'0'}
              siSymbol={balanceFormat[2] || balanceFormat[1]}
            />

            {!!(errors && errors.length) && renderError()}

            {!!networkMap[originChain].isEthereum !== isEthereumAddress(senderId) &&
              <Warning className='xcm-transfer-warning'>
                {t<string>(`Sender address must be ${networkMap[originChain].isEthereum ? 'EVM' : 'substrate'} type`)}
              </Warning>
            }

            {recipientId && !!networkMap[destinationChain].isEthereum !== isEthereumAddress(recipientId) &&
              <Warning className='xcm-transfer-warning'>
                {t<string>(`Receiver address must be ${networkMap[originChain].isEthereum ? 'EVM' : 'substrate'} type`)}
              </Warning>
            }

            <div className='bridge-button-container'>
              <Button
                className='bridge-button'
                onClick={_onCancel}
              >
            <span>
              {t<string>('Cancel')}
            </span>
              </Button>

              <Button
                className='bridge-button'
                isDisabled={false}
                onClick={_onTransfer}
              >
            <span>
              {t<string>('Transfer')}
            </span>
              </Button>
            </div>
          </> :
          <Warning className='xcm-transfer-warning'>
            {t<string>('Current original chain is disable. Please enable to continue this action')}
          </Warning>
        }

        {isShowTxModal && mainTokenInfo && (
          <AuthTransaction
            balanceFormat={balanceFormat}
            feeInfo={getAuthTransactionFeeInfo(fee, feeDecimal, feeSymbol, mainTokenInfo, chainRegistryMap[selectedNetworkKey].tokenMap)}
            networkMap={networkMap}
            onCancel={_onCancelTx}
            onChangeResult={_onChangeResult}
            requestPayload={{
              from: senderId,
              to: recipientId,
              originalNetworkKey: originChain,
              destinationNetworkKey: destinationChain,
              value: valueToTransfer,
              token: selectedToken
            }}
            originChainOptions={originChainOptions}
            destinationChainOptions={destinationChainOptions}
          />
        )}
      </div>
    </>
  );
}

export default React.memo(styled(Wrapper)(({ theme }: Props) => `
  display: flex;
  flex: 1;
  overflow-y: auto;
  flex-direction: column;

  .bridge-container {
    padding: 15px;
    flex: 1;
    overflow-y: auto;
  }

  .bridge-amount-input {
    margin-bottom: 10px;
    margin-top: 15px;
  }

  .bridge__chain-selector-area {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    margin-bottom: 15px;
  }

  .bridge__chain-swap {
    min-width: 40px;
    width: 40px;
    height: 40px;
    border-radius: 40%;
    border: 2px solid ${theme.buttonBorderColor};
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 24px 12px 0;
  }

  .bridge-button-container {
    display: flex;
    position: sticky;
    bottom: -15px;
    padding: 15px;
    margin-left: -15px;
    margin-bottom: -15px;
    margin-right: -15px;
    background-color: ${theme.background};
  }

  .bridge__chain-selector {
    flex: 1;
  }

  .bridge__chain-selector label {
    font-size: 15px;
    text-transform: none;
    color: ${theme.textColor};
    line-height: 26px;
    font-weight: 500;
  }

  .bridge-button {
    flex: 1;
  }

  .bridge-button:first-child {
    background-color: ${theme.buttonBackground1};
    margin-right: 8px;

    span {
      color: ${theme.buttonTextColor2};
    }
  }

  .bridge-button:last-child {
    margin-left: 8px;
  }
`));
