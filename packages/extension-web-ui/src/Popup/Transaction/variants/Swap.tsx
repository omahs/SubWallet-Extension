// Copyright 2019-2022 @subwallet/extension-web-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { _ChainAsset } from '@subwallet/chain-list/types';
import { SwapError } from '@subwallet/extension-base/background/errors/SwapError';
import { _getAssetDecimals, _getAssetOriginChain, _getAssetSymbol, _isChainEvmCompatible, _parseAssetRefKey } from '@subwallet/extension-base/services/chain-service/utils';
import { SWTransactionResponse } from '@subwallet/extension-base/services/transaction-service/types';
import { OptimalSwapPath, SwapFeeComponent, SwapQuote, SwapRequest } from '@subwallet/extension-base/types/swap';
import { AccountSelector, AddressInput, HiddenInput, PageWrapper, SwapFromField, SwapToField } from '@subwallet/extension-web-ui/components';
import { AllSwapQuotes } from '@subwallet/extension-web-ui/components/Modal/Swap';
import AddMoreBalanceModal from '@subwallet/extension-web-ui/components/Modal/Swap/AddMoreBalanceModal';
import ChooseFeeTokenModal from '@subwallet/extension-web-ui/components/Modal/Swap/ChooseFeeTokenModal';
import SwapRoute from '@subwallet/extension-web-ui/components/Swap/SwapRoute';
import { BN_TEN, BN_ZERO, SWAP_ALL_QUOTES_MODAL, SWAP_CHOOSE_FEE_TOKEN_MODAL, SWAP_MORE_BALANCE_MODAL, SWAP_SLIPPAGE_MODAL } from '@subwallet/extension-web-ui/constants';
import { DataContext } from '@subwallet/extension-web-ui/contexts/DataContext';
import { ScreenContext } from '@subwallet/extension-web-ui/contexts/ScreenContext';
import { useSelector, useTransactionContext, useWatchTransaction } from '@subwallet/extension-web-ui/hooks';
import { getLatestSwapQuote, handleSwapRequest, handleSwapStep, validateSwapProcess } from '@subwallet/extension-web-ui/messaging/transaction/swap';
import { FreeBalance, TransactionContent, TransactionFooter } from '@subwallet/extension-web-ui/Popup/Transaction/parts';
import { DEFAULT_SWAP_PROCESS, SwapActionType, swapReducer } from '@subwallet/extension-web-ui/reducer';
import { FormCallbacks, FormFieldData, SwapParams, ThemeProps, TokenSelectorItemType } from '@subwallet/extension-web-ui/types';
import { convertFieldToObject } from '@subwallet/extension-web-ui/utils';
import { BackgroundIcon, Button, Form, Icon, Logo, ModalContext, Number, PageIcon } from '@subwallet/react-ui';
import { Rule } from '@subwallet/react-ui/es/form';
import BigN from 'bignumber.js';
import CN from 'classnames';
import { ArrowsDownUp, CaretDown, CaretRight, CaretUp, Info, ListBullets, PencilSimpleLine, PlusCircle, XCircle } from 'phosphor-react';
import React, { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { isAddress, isEthereumAddress } from '@polkadot/util-crypto';

import MetaInfo from '../../../components/MetaInfo/MetaInfo';
import SlippageModal from '../../../components/Modal/Swap/SlippageModal';
import useNotification from '../../../hooks/common/useNotification';

type Props = ThemeProps;

const hideFields: Array<keyof SwapParams> = ['fromAmount', 'fromTokenSlug', 'toTokenSlug', 'chain'];

function getTokenSelectorItem (tokenSlugs: string[], assetRegistryMap: Record<string, _ChainAsset>): TokenSelectorItemType[] {
  const result: TokenSelectorItemType[] = [];

  tokenSlugs.forEach((slug) => {
    const asset = assetRegistryMap[slug];

    if (asset) {
      result.push({
        originChain: asset.originChain,
        slug,
        symbol: asset.symbol,
        name: asset.name
      });
    }
  });

  return result;
}

function getDecimals (assetInfo?: _ChainAsset) {
  return assetInfo ? _getAssetDecimals(assetInfo) : 0;
}

function getSymbol (assetInfo?: _ChainAsset) {
  return assetInfo ? _getAssetSymbol(assetInfo) : '';
}

// @ts-ignore
function getOriginChain (assetInfo?: _ChainAsset) {
  return assetInfo ? _getAssetOriginChain(assetInfo) : '';
}

const Component = () => {
  const { t } = useTranslation();
  const notify = useNotification();
  const { defaultData, onDone, persistData, setCustomScreenTitle } = useTransactionContext<SwapParams>();
  const { isWebUI } = useContext(ScreenContext);

  const { activeModal } = useContext(ModalContext);

  const { isAllAccount } = useSelector((state) => state.accountState);
  const assetRegistryMap = useSelector((state) => state.assetRegistry.assetRegistry);
  const swapPairs = useSelector((state) => state.swap.swapPairs);
  const priceMap = useSelector((state) => state.price.priceMap);
  const { chainInfoMap } = useSelector((root) => root.chainStore);
  const [form] = Form.useForm<SwapParams>();
  const formDefault = useMemo((): SwapParams => ({ ...defaultData }), [defaultData]);

  const [quoteOptions, setQuoteOptions] = useState<SwapQuote[]>([]);
  const [currentQuote, setCurrentQuote] = useState<SwapQuote | undefined>(undefined);
  const [quoteAliveUntil, setQuoteAliveUntil] = useState<number | undefined>(undefined);
  const [quoteCountdownTime, setQuoteCountdownTime] = useState<number>(0);
  const [currentQuoteRequest, setCurrentQuoteRequet] = useState<SwapRequest | undefined>(undefined);
  const [feeOptions, setFeeOptions] = useState<string[] | undefined>([]);
  const [currentFeeOption, setCurrentFeeOption] = useState<string | undefined>(undefined);
  const [currentSlippage, setCurrentSlippage] = useState<number>(0.02);
  const [swapError, setSwapError] = useState<SwapError|undefined>(undefined);
  const [currentOptimalSwapPath, setOptimalSwapPath] = useState<OptimalSwapPath | undefined>(undefined);
  const showQuoteAreRef = useRef(false);

  const [isViewFeeDetails, setIsViewFeeDetails] = useState<boolean>(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  // @ts-ignore
  const fromValue = useWatchTransaction('from', form, defaultData);
  const fromAmountValue = useWatchTransaction('fromAmount', form, defaultData);
  const fromTokenSlugValue = useWatchTransaction('fromTokenSlug', form, defaultData);
  const toTokenSlugValue = useWatchTransaction('toTokenSlug', form, defaultData);
  const chainValue = useWatchTransaction('chain', form, defaultData);

  const [processState, dispatchProcessState] = useReducer(swapReducer, DEFAULT_SWAP_PROCESS);

  const fromAndToTokenMap = useMemo<Record<string, string[]>>(() => {
    const result: Record<string, string[]> = {};

    swapPairs.forEach((pair) => {
      if (!result[pair.from]) {
        result[pair.from] = [pair.to];
      } else {
        result[pair.from].push(pair.to);
      }
    });

    return result;
  }, [swapPairs]);

  const fromTokenItems = useMemo<TokenSelectorItemType[]>(() => {
    return getTokenSelectorItem(Object.keys(fromAndToTokenMap), assetRegistryMap);
  }, [assetRegistryMap, fromAndToTokenMap]);

  const toTokenItems = useMemo<TokenSelectorItemType[]>(() => {
    return getTokenSelectorItem(fromAndToTokenMap[fromTokenSlugValue] || [], assetRegistryMap);
  }, [assetRegistryMap, fromAndToTokenMap, fromTokenSlugValue]);

  const isSwitchable = useMemo(() => {
    return fromAndToTokenMap[toTokenSlugValue];
  }, [fromAndToTokenMap, toTokenSlugValue]);

  // todo: fill later
  const destChain = '';
  const destChainNetworkPrefix = 42;
  const destChainGenesisHash = '';

  const fromAssetInfo = useMemo(() => {
    return assetRegistryMap[fromTokenSlugValue] || undefined;
  }, [assetRegistryMap, fromTokenSlugValue]);

  const toAssetInfo = useMemo(() => {
    return assetRegistryMap[toTokenSlugValue] || undefined;
  }, [assetRegistryMap, toTokenSlugValue]);

  const feeAssetInfo = useMemo(() => {
    return (currentFeeOption ? assetRegistryMap[currentFeeOption] : undefined);
  }, [assetRegistryMap, currentFeeOption]);

  const recipientAddressValidator = useCallback((rule: Rule, _recipientAddress: string): Promise<void> => {
    if (!_recipientAddress) {
      return Promise.reject(t('Recipient address is required'));
    }

    if (!isAddress(_recipientAddress)) {
      return Promise.reject(t('Invalid recipient address'));
    }

    return Promise.resolve();
  }, [t]);

  const onSelectFromToken = useCallback((tokenSlug: string) => {
    form.setFieldValue('fromTokenSlug', tokenSlug);
  }, [form]);

  const onSelectToToken = useCallback((tokenSlug: string) => {
    form.setFieldValue('toTokenSlug', tokenSlug);
  }, [form]);

  const onOpenSlippageModal = useCallback(() => {
    activeModal(SWAP_SLIPPAGE_MODAL);
  }, [activeModal]);

  const openAllQuotesModal = useCallback(() => {
    activeModal(SWAP_ALL_QUOTES_MODAL);
  }, [activeModal]);

  const openChooseFeeToken = useCallback(() => {
    activeModal(SWAP_CHOOSE_FEE_TOKEN_MODAL);
  }, [activeModal]);

  const onSelectQuote = useCallback((quote: SwapQuote) => {
    setCurrentQuote(quote);
    setFeeOptions(quote.feeInfo.feeOptions);
    setCurrentFeeOption(quote.feeInfo.feeOptions?.[0]);
  }, []);

  const onSelectFeeOption = useCallback((slug: string) => {
    setCurrentFeeOption(slug);
  }, []);
  const onSelectSlippage = useCallback((slippage: number) => {
    setCurrentSlippage(slippage);
  }, []);

  const onToggleFeeDetails = useCallback(() => {
    setIsViewFeeDetails((prev) => !prev);
  }, []);

  const onChangeAmount = useCallback((value: string) => {
    form.setFieldValue('fromAmount', value);
  }, [form]);

  const onSwitchSide = useCallback(() => {
    if (fromTokenSlugValue && toTokenSlugValue) {
      form.setFieldsValue({
        fromTokenSlug: toTokenSlugValue,
        toTokenSlug: fromTokenSlugValue
      });
      form.validateFields(['from']).catch((e) => {
        console.log('Error when validating', e);
      });
    }
  }, [form, fromTokenSlugValue, toTokenSlugValue]);

  const onFieldsChange: FormCallbacks<SwapParams>['onFieldsChange'] = useCallback((changedFields: FormFieldData[], allFields: FormFieldData[]) => {
    const values = convertFieldToObject<SwapParams>(allFields);

    persistData(values);
  }, [persistData]);

  // todo: will optimize fee display logic later
  const getTotalConvertedBalance = useMemo(() => {
    let totalBalance = BN_ZERO;

    currentQuote?.feeInfo.feeComponent.forEach((feeItem) => {
      const asset = assetRegistryMap[feeItem.tokenSlug];

      if (asset) {
        const { decimals, priceId } = asset;
        const price = priceMap[priceId || ''] || 0;

        totalBalance = totalBalance.plus(new BigN(feeItem.amount).div(BN_TEN.pow(decimals || 0)).multipliedBy(price));
      }
    });

    return totalBalance;
  }, [assetRegistryMap, currentQuote?.feeInfo.feeComponent, priceMap]);

  const getConvertedBalance = useCallback((feeItem: SwapFeeComponent) => {
    const asset = assetRegistryMap[feeItem.tokenSlug];

    if (asset) {
      const { decimals, priceId } = asset;
      const price = priceMap[priceId || ''] || 0;

      return new BigN(feeItem.amount).div(BN_TEN.pow(decimals || 0)).multipliedBy(price);
    }

    return BN_ZERO;
  }, [assetRegistryMap, priceMap]);

  const getTotalFeeByType = useMemo(() => {
    const totalFeeByType: { [key: string]: BigN } = {};
    const feeTypeMapping: { [key: string]: string } = {
      NETWORK_FEE: 'Network fee',
      PLATFORM_FEE: 'Protocol fee',
      WALLET_FEE: 'Wallet commission'
    };

    currentQuote?.feeInfo.feeComponent.forEach((feeItem) => {
      const { feeType } = feeItem;
      const mappedFeeType = feeTypeMapping[feeType] || feeType;

      if (!totalFeeByType[mappedFeeType]) {
        totalFeeByType[mappedFeeType] = BN_ZERO;
      }

      totalFeeByType[mappedFeeType] = totalFeeByType[mappedFeeType].plus(getConvertedBalance(feeItem));
    });

    return totalFeeByType;
  }, [currentQuote?.feeInfo.feeComponent, getConvertedBalance]);

  const canShowAvailableBalance = useMemo(() => {
    if (fromValue && chainValue && chainInfoMap[chainValue]) {
      return isEthereumAddress(fromValue) === _isChainEvmCompatible(chainInfoMap[chainValue]);
    }

    return false;
  }, [fromValue, chainValue, chainInfoMap]);

  const renderRateInfo = () => {
    if (!currentQuote) {
      return null;
    }

    return (
      <div className={'__quote-estimate-swap-value'}>
        <Number
          decimal={0}
          suffix={getSymbol(fromAssetInfo)}
          value={1}
        />
        <span>&nbsp;~&nbsp;</span>
        <Number
          decimal={0}
          suffix={getSymbol(toAssetInfo)}
          value={currentQuote.rate}
        />
      </div>
    );
  };

  const renderQuoteEmptyBlock = () => {
    const isError = !!swapError;

    const message = isError ? swapError?.message : t('No routes available at this time. Please try a different pair.');

    return (
      <div className={CN('__quote-empty-block', {
        '-error': isError
      })}
      >
        <PageIcon
          color='var(--empty-quote-icon-color)'
          iconProps={{
            weight: isError ? 'fill' : undefined,
            phosphorIcon: isError ? XCircle : ListBullets
          }}
        />

        <div className={CN('__message-error', {
          '-message': isError
        })}
        >{message}</div>
      </div>
    );
  };

  const validateSwapFromAccount = useCallback((rule: Rule, fromValue: string): Promise<void> => {
    if (!fromValue) {
      return Promise.reject(t('Swap from account is required'));
    }

    if (fromAssetInfo?.originChain && chainInfoMap[fromAssetInfo?.originChain]) {
      const isAddressEvm = isEthereumAddress(fromValue);
      const isEvmCompatible = _isChainEvmCompatible(chainInfoMap[fromAssetInfo?.originChain]);

      if ((isAddressEvm && !isEvmCompatible) || (!isAddressEvm && isEvmCompatible)) {
        return Promise.reject(t('Invalid swap from account'));
      }
    }

    return Promise.resolve();
  }, [chainInfoMap, fromAssetInfo?.originChain, t]);

  const onError = useCallback(
    (error: Error) => {
      notify({
        message: error.message,
        type: 'error',
        duration: 8
      });

      dispatchProcessState({
        type: SwapActionType.STEP_ERROR_ROLLBACK,
        payload: error
      });
    },
    [notify]
  );

  const onSuccess = useCallback(
    (lastStep: boolean, needRollback: boolean): ((rs: SWTransactionResponse) => boolean) => {
      return (rs: SWTransactionResponse): boolean => {
        const { errors: _errors, id, warnings } = rs;

        if (_errors.length || warnings.length) {
          if (_errors[0]?.message !== 'Rejected by user') {
            if (
              _errors[0]?.message.startsWith('UnknownError Connection to Indexed DataBase server lost') ||
              _errors[0]?.message.startsWith('Provided address is invalid, the capitalization checksum test failed') ||
              _errors[0]?.message.startsWith('connection not open on send()')
            ) {
              notify({
                message: t('Your selected network has lost connection. Update it by re-enabling it or changing network provider'),
                type: 'error',
                duration: 8
              });

              return false;
            }

            // hideAll();
            onError(_errors[0]);

            return false;
          } else {
            dispatchProcessState({
              type: needRollback ? SwapActionType.STEP_ERROR_ROLLBACK : SwapActionType.STEP_ERROR,
              payload: _errors[0]
            });

            return false;
          }
        } else if (id) {
          dispatchProcessState({
            type: SwapActionType.STEP_COMPLETE,
            payload: rs
          });

          if (lastStep) {
            onDone(id);

            return false;
          }

          return true;
        } else {
          return false;
        }
      };
    },
    [notify, onDone, onError, t]
  );

  const onSubmit: FormCallbacks<SwapParams>['onFinish'] = useCallback((values: SwapParams) => {
    if (!currentQuote || !currentOptimalSwapPath) {
      return;
    }

    setSubmitLoading(true);

    const { from, recipient } = values;

    const submitData = async (step: number): Promise<boolean> => {
      dispatchProcessState({
        type: SwapActionType.STEP_SUBMIT,
        payload: null
      });

      const isFirstStep = step === 0;
      const isLastStep = step === processState.steps.length - 1;
      const needRollback = step === 1;

      try {
        if (isFirstStep) {
          const validatePromise = validateSwapProcess({
            address: from,
            process: currentOptimalSwapPath,
            selectedQuote: currentQuote
          });

          const _errors = await validatePromise;

          if (_errors.length) {
            onError(_errors[0]);

            return false;
          } else {
            dispatchProcessState({
              type: SwapActionType.STEP_COMPLETE,
              payload: true
            });
            dispatchProcessState({
              type: SwapActionType.STEP_SUBMIT,
              payload: null
            });

            return await submitData(step + 1);
          }
        } else {
          const submitPromise: Promise<SWTransactionResponse> = handleSwapStep({
            process: currentOptimalSwapPath,
            currentStep: step,
            quote: currentQuote,
            address: from,
            slippage: currentSlippage,
            recipient
          });

          const rs = await submitPromise;
          const success = onSuccess(isLastStep, needRollback)(rs);

          if (success) {
            return await submitData(step + 1);
          } else {
            return false;
          }
        }
      } catch (e) {
        onError(e as Error);

        return false;
      }
    };

    setTimeout(() => {
      submitData(processState.currentStep)
        .catch(onError)
        .finally(() => {
          setSubmitLoading(false);
        });
    }, 300);
  }, [currentOptimalSwapPath, currentQuote, currentSlippage, onError, onSuccess, processState.currentStep, processState.steps.length]);

  useEffect(() => {
    form.setFieldValue('chain', getOriginChain(fromAssetInfo));
  }, [form, fromAssetInfo]);

  useEffect(() => {
    let sync = true;
    let timeout: NodeJS.Timeout;

    // todo: simple validate before do this
    if (fromValue && fromTokenSlugValue && toTokenSlugValue && fromAmountValue) {
      timeout = setTimeout(() => {
        const currentRequest: SwapRequest = {
          address: fromValue,
          pair: {
            slug: _parseAssetRefKey(fromTokenSlugValue, toTokenSlugValue),
            from: fromTokenSlugValue,
            to: toTokenSlugValue
          },
          fromAmount: fromAmountValue,
          slippage: 0.05
        };

        setCurrentQuoteRequet(currentRequest);

        handleSwapRequest(currentRequest).then((result) => {
          if (sync) {
            setOptimalSwapPath(result.process);

            dispatchProcessState({
              payload: {
                steps: result.process.steps,
                feeStructure: result.process.totalFee
              },
              type: SwapActionType.STEP_CREATE
            });

            setQuoteOptions(result.quote.quotes);
            setCurrentQuote(result.quote.optimalQuote);
            setQuoteAliveUntil(result.quote.aliveUntil);
            setFeeOptions(result.quote.optimalQuote?.feeInfo?.feeOptions || []);
            setCurrentFeeOption(result.quote.optimalQuote?.feeInfo?.feeOptions?.[0]);
            setSwapError(result.quote.error);
            showQuoteAreRef.current = true;
          }
        }).catch((e) => {
          console.log('handleSwapRequest error', e);
        });
      }, 300);
    }

    return () => {
      sync = false;
      clearTimeout(timeout);
    };
  }, [fromAmountValue, fromTokenSlugValue, fromValue, swapPairs, toTokenSlugValue]);

  useEffect(() => {
    let timer: NodeJS.Timer;

    if (quoteAliveUntil) {
      timer = setInterval(() => {
        const _time = Math.floor((quoteAliveUntil - Date.now()) / 1000 + 0.5);

        if (_time < 0) {
          setQuoteCountdownTime(0);
          clearInterval(timer);
        } else {
          setQuoteCountdownTime(_time);
        }
      }, 1000);
    } else {
      setQuoteCountdownTime(0);
    }

    return () => {
      clearInterval(timer);
    };
  }, [quoteAliveUntil]);

  useEffect(() => {
    let timer: NodeJS.Timer;
    let isSync = true;

    const updateQuote = () => {
      if (currentQuoteRequest) {
        getLatestSwapQuote(currentQuoteRequest).then((rs) => {
          if (isSync) {
            setCurrentQuote(rs.optimalQuote);
            setQuoteAliveUntil(rs.aliveUntil);
          }
        }).catch((e) => {
          console.log('Error when getLatestSwapQuote', e);
        });
      }
    };

    if (quoteAliveUntil) {
      timer = setInterval(() => {
        if ((quoteAliveUntil - Date.now()) < 0) {
          updateQuote();
          clearInterval(timer);
        }
      }, 1000);
    }

    return () => {
      isSync = false;
      clearInterval(timer);
    };
  }, [currentQuote, currentQuoteRequest, quoteAliveUntil]);

  useEffect(() => {
    setCustomScreenTitle(t('Swap'));

    return () => {
      setCustomScreenTitle(undefined);
    };
  }, [setCustomScreenTitle, t]);

  useEffect(() => {
    if (!fromTokenSlugValue && fromTokenItems.length) {
      form.setFieldValue('fromTokenSlug', fromTokenItems[0].slug);
    }
  }, [form, fromTokenItems, fromTokenSlugValue]);

  useEffect(() => {
    if (toTokenItems.length) {
      if (!toTokenSlugValue || !toTokenItems.some((t) => t.slug === toTokenSlugValue)) {
        form.setFieldValue('toTokenSlug', toTokenItems[0].slug);
      }
    }
  }, [form, toTokenItems, toTokenSlugValue]);

  return (
    <>
      <>
        <div className={CN('__transaction-form-area', { '-no-right-part': !showQuoteAreRef.current })}>
          <TransactionContent>
            <Form
              className={'form-container'}
              form={form}
              initialValues={formDefault}
              onFieldsChange={onFieldsChange}
              onFinish={onSubmit}
            >
              <HiddenInput fields={hideFields} />

              <Form.Item
                name={'from'}
                rules={[
                  {
                    validator: validateSwapFromAccount
                  }
                ]}
              >
                <AccountSelector
                  disabled={!isAllAccount}
                  label={t('Swap from account')}
                />
              </Form.Item>

              <div className={'__balance-display-area'}>
                <FreeBalance
                  address={fromValue}
                  chain={chainValue}
                  hidden={!canShowAvailableBalance}
                  isSubscribe={true}
                  label={`${t('Available balance')}:`}
                  tokenSlug={fromTokenSlugValue}
                />
              </div>

              <div className={'__swap-field-area'}>
                <SwapFromField
                  amountValue={fromAmountValue}
                  decimals={getDecimals(fromAssetInfo)}
                  label={t('From')}
                  onChangeAmount={onChangeAmount}
                  onSelectToken={onSelectFromToken}
                  tokenSelectorItems={fromTokenItems}
                  tokenSelectorValue={fromTokenSlugValue}
                />

                <div className='__switch-side-container'>
                  <Button
                    className={'__switch-button'}
                    disabled={!isSwitchable}
                    icon={(
                      <Icon
                        customSize={'20px'}
                        phosphorIcon={ArrowsDownUp}
                        weight='fill'
                      />
                    )}
                    onClick={onSwitchSide}
                    shape='circle'
                    size='xs'
                    type={'ghost'}
                  >
                  </Button>
                </div>

                <SwapToField
                  currentQuote={currentQuote}
                  decimals={getDecimals(toAssetInfo)}
                  fromAsset={fromAssetInfo}
                  onSelectToken={onSelectToToken}
                  toAsset={toAssetInfo}
                  tokenSelectorItems={toTokenItems}
                  tokenSelectorValue={toTokenSlugValue}
                />
              </div>

              <Form.Item
                name={'recipient'}
                rules={[
                  {
                    validator: recipientAddressValidator
                  }
                ]}
                statusHelpAsTooltip={isWebUI}
                validateTrigger='onBlur'
              >
                <AddressInput
                  addressPrefix={destChainNetworkPrefix}
                  allowDomain={true}
                  chain={destChain}
                  label={t('Recipient account')}
                  networkGenesisHash={destChainGenesisHash}
                  placeholder={t('Input your recipient account')}
                  saveAddress={true}
                  showAddressBook={true}
                  showScanner={true}
                />
              </Form.Item>
            </Form>

            <div
              className={'__slippage-info'}
              onClick={onOpenSlippageModal}
            >
              <span>Slippage:</span>
              &nbsp;<span>{currentSlippage * 100}%</span>
              <div
                className={'__slippage-editor-button'}
              >
                <Icon
                  className={'__slippage-editor-button-icon'}
                  phosphorIcon={PencilSimpleLine}
                  size='sm'
                />
              </div>

            </div>
          </TransactionContent>
          <TransactionFooter>
            <Button
              block={true}
              className={'__swap-submit-button'}
              disabled={submitLoading}
              icon={(
                <Icon
                  phosphorIcon={PlusCircle}
                  weight={'fill'}
                />
              )}
              loading={submitLoading}
              onClick={form.submit}
            >
              {t('Swap')}
            </Button>
          </TransactionFooter>
        </div>

        {
          showQuoteAreRef.current && (
            <div className={'__transaction-swap-quote-info-area'}>
              <div className={'__item-quote-header'}>
                <div className={'__item-left-part'}>
                  <BackgroundIcon
                    backgroundColor='#004BFF'
                    className={'__quote-icon-info'}
                    iconColor='#fff'
                    phosphorIcon={Info}
                    weight={'fill'}
                  />
                  <div className={'__text'}>Swap quote</div>
                </div>
                <div className={'__item-right-part'}>
                  <div className={'__item-right-part-button'}>
                    <Button
                      disabled={!quoteOptions.length}
                      onClick={openAllQuotesModal}
                      size='xs'
                      type='ghost'
                    >
                      <span className={'__item-right-title'}>{t('View quote')}</span>

                      <Icon
                        phosphorIcon={CaretRight}
                        size={'sm'}
                      />
                    </Button>
                  </div>
                </div>
              </div>

              {
                !!currentQuote && (
                  <MetaInfo
                    className={CN('__quote-info-block')}
                    hasBackgroundWrapper
                    labelColorScheme={'gray'}
                    spaceSize={'sm'}
                    valueColorScheme={'gray'}
                  >
                    <MetaInfo.Default
                      className={'__quote-rate'}
                      label={t('Quote rate')}
                      valueColorSchema={'gray'}
                    >
                      {renderRateInfo()}
                    </MetaInfo.Default>

                    <MetaInfo.Default
                      className={'__swap-provider'}
                      label={t('Swap provider')}
                    >
                      {currentQuote.provider.name}
                    </MetaInfo.Default>

                    <MetaInfo.Default
                      className={'-d-column'}
                      label={t('Swap route')}
                    >
                    </MetaInfo.Default>
                    <SwapRoute swapRoute={currentQuote.route} />
                  </MetaInfo>
                )
              }

              {
                !currentQuote && renderQuoteEmptyBlock()
              }

              <div className={'__item-footer-time'}>
                Quote reset in: {quoteCountdownTime}s
              </div>

              {
                !!currentQuote && (
                  <MetaInfo
                    className={CN('__quote-info-block')}
                    hasBackgroundWrapper
                    labelColorScheme={'gray'}
                    spaceSize={'xs'}
                    valueColorScheme={'gray'}
                  >
                    <MetaInfo.Number
                      className={'__total-fee-value'}
                      decimals={0}
                      label={t('Estimated fee')}
                      onClickValue={onToggleFeeDetails}
                      prefix={'$'}
                      suffixNode={
                        <Icon
                          className={'__caret-icon-button'}
                          customSize={'20px'}
                          phosphorIcon={isViewFeeDetails ? CaretUp : CaretDown}
                        />
                      }
                      value={getTotalConvertedBalance}
                    />

                    {
                      isViewFeeDetails && (
                        <div className={'__quote-fee-details-block'}>
                          {Object.entries(getTotalFeeByType).map(([feeType, totalFee], index) => (
                            <MetaInfo.Number
                              decimals={0}
                              key={index}
                              label={t(feeType)}
                              prefix={'$'}
                              value={totalFee}
                            />
                          ))}
                        </div>
                      )
                    }

                    <div className={'__separator'}></div>
                    <div className={'__item-fee-wrapper'}>
                      <div className={'__item-fee-paid-label'}>Fee paid in</div>
                      <div
                        className={'__item-fee-token'}
                        onClick={openChooseFeeToken}
                      >
                        <Logo
                          className='token-logo'
                          isShowSubLogo={false}
                          shape='circle'
                          size={24}
                          token={currentQuote.pair.from}
                        />
                        <div className={'__token-fee-paid-item'}>{getSymbol(feeAssetInfo)}</div>
                        <Icon
                          className={'__edit-token'}
                          customSize={'20px'}
                          phosphorIcon={PencilSimpleLine}
                        />
                      </div>
                    </div>
                  </MetaInfo>
                )
              }
            </div>
          )
        }
      </>

      <ChooseFeeTokenModal
        estimatedFee={getTotalConvertedBalance}
        items={feeOptions}
        modalId={SWAP_CHOOSE_FEE_TOKEN_MODAL}
        onSelectItem={onSelectFeeOption}
        selectedItem={currentFeeOption}
      />
      <SlippageModal
        modalId={SWAP_SLIPPAGE_MODAL}
        onApplySlippage={onSelectSlippage}
      />
      <AddMoreBalanceModal
        modalId={SWAP_MORE_BALANCE_MODAL}
      />
      <AllSwapQuotes
        items={quoteOptions}
        modalId={SWAP_ALL_QUOTES_MODAL}
        onSelectItem={onSelectQuote}
        selectedItem={currentQuote}
      />
    </>
  );
};

const Wrapper: React.FC<Props> = (props: Props) => {
  const { className } = props;
  const dataContext = useContext(DataContext);

  return (
    <PageWrapper
      className={CN(className)}
      resolve={dataContext.awaitStores(['swap', 'price'])}
    >
      <Component />
    </PageWrapper>
  );
};

const Swap = styled(Wrapper)<Props>(({ theme: { token } }: Props) => {
  return {
    display: 'flex',
    flexDirection: 'row',
    paddingTop: 24,
    maxWidth: 784,
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    justifyContent: 'center',
    gap: token.size,
    '.__item-right-title': {
      color: token.colorTextTertiary
    },
    '.__item-fee-wrapper': {
      color: token.colorTextTertiary,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      cursor: 'pointer'
    },
    '.__item-fee-token': {
      display: 'flex',
      alignItems: 'center'
    },
    '.__token-fee-paid-item': {
      paddingLeft: 8,
      color: token.colorWhite
    },
    '.__quote-icon-info': {
      fontSize: 16,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    },
    '.ant-background-icon': {
      width: 24,
      height: 24
    },
    '.__transaction-form-area.-no-right-part': {
      maxWidth: 383
    },

    '.__item-right-title:hover': {
      color: token.colorWhite
    },
    '.__item-right-part-button:hover': {
      color: token.colorWhite
    },

    '.__slippage-info': {
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'center',
      color: token.colorSuccess,
      cursor: 'pointer',
      marginBottom: 24
    },
    '.__item-footer-time': {
      color: token.colorWarningText,
      display: 'flex',
      justifyContent: 'flex-end',
      paddingLeft: token.paddingXS,
      paddingRight: token.paddingXS,
      marginBottom: token.margin,
      marginTop: token.marginXXS,
      fontSize: token.fontSize,
      fontWeight: token.bodyFontWeight,
      lineHeight: token.lineHeight
    },
    '.__slippage-editor-button': {
      paddingLeft: token.paddingXXS
    },
    '.__caret-icon-button': {
      paddingLeft: token.paddingXXS
    },
    '.__edit-token': {
      paddingLeft: token.paddingXXS
    },

    '.free-balance': {
      marginBottom: token.marginSM
    },

    // swap quote

    '.__transaction-swap-quote-info-area': {},
    '.__quote-estimate-swap-value': {
      display: 'flex'
    },
    '.__quote-rate .__value': {
      fontSize: token.fontSize,
      fontWeight: token.bodyFontWeight,
      lineHeight: token.lineHeight,
      color: token.colorWhite
    },
    '.__swap-provider .__value': {
      fontSize: token.fontSize,
      fontWeight: token.bodyFontWeight,
      lineHeight: token.lineHeight,
      color: token.colorWhite
    },

    '.__quote-info-block': {
      paddingLeft: 24,
      paddingRight: 24,
      paddingTop: 16,
      paddingBottom: 16
    },

    '.__quote-empty-block': {
      background: token.colorBgSecondary,
      borderRadius: token.borderRadiusLG,
      padding: token.padding,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: token.size,

      '--empty-quote-icon-color': token['gray-6']
    },

    '.__quote-empty-block.-error': {
      '--empty-quote-icon-color': token.colorError
    },

    '.__message-error': {
      color: token.colorTextTertiary,
      fontSize: token.fontSize,
      fontWeight: token.bodyFontWeight,
      lineHeight: token.lineHeight
    },
    '.__message-error.-message': {
      color: token.colorError,
      fontSize: token.fontSize,
      fontWeight: token.bodyFontWeight,
      lineHeight: token.lineHeight,
      textAlign: 'center'
    },

    '.__total-fee-value': {
      fontSize: token.fontSize,
      lineHeight: token.lineHeight,
      fontWeight: token.bodyFontWeight,
      color: token.colorTextLight2,

      '.ant-number-integer': {
        color: `${token.colorTextLight2} !important`,
        fontSize: 'inherit !important',
        fontWeight: 'inherit !important',
        lineHeight: 'inherit'
      },

      '.ant-number-decimal, .ant-number-prefix': {
        color: `${token.colorTextLight2} !important`,
        fontSize: `${token.fontSize}px !important`,
        fontWeight: 'inherit !important',
        lineHeight: token.colorTextLight2
      }
    },
    '.__quote-fee-details-block': {
      marginTop: token.marginXS,
      paddingLeft: token.paddingXS,
      fontSize: token.fontSize,
      lineHeight: token.lineHeight,
      fontWeight: token.bodyFontWeight,
      color: token.colorWhite,

      '.ant-number-integer': {
        color: `${token.colorWhite} !important`,
        fontSize: 'inherit !important',
        fontWeight: 'inherit !important',
        lineHeight: 'inherit'
      },

      '.ant-number-decimal, .ant-number-prefix': {
        color: `${token.colorWhite} !important`,
        fontSize: `${token.fontSize}px !important`,
        fontWeight: 'inherit !important',
        lineHeight: token.colorTextLight2
      }
    },
    '.__separator': {
      height: 2,
      opacity: 0.8,
      backgroundColor: token.colorBgBorder,
      marginTop: 12,
      marginBottom: 12
    },
    '.__error-message': {
      color: token.colorError
    },

    '.__item-quote-header': {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
      marginTop: -7
    },
    '.__item-left-part': {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    },
    '.__item-right-part-button .ant-btn >span+.anticon': {
      marginInlineStart: 0
    },
    '.__item-right-part': {
      display: 'flex',
      alignItems: 'center'
    },

    '.__transaction-form-area .transaction-footer': {
      paddingTop: 0,
      paddingBottom: 0,
      paddingRight: 0,
      paddingLeft: 0
    },
    '.__transaction-form-area .transaction-content': {
      paddingRight: 0,
      paddingLeft: 0
    },
    '.__transaction-form-area .ant-form-item ': {
      marginBottom: 12
    },
    '.__token-selector-wrapper .ant-select-modal-input-wrapper': {
      color: token.colorWhite,
      paddingLeft: 16
    },
    '.__token-selector-wrapper': {
      flex: 1,
      overflow: 'hidden',
      minWidth: 160,
      maxWidth: 182
    },
    '.__amount-wrapper': {
      flex: 1
    },

    // desktop

    '.web-ui-enable &': {
      '.__transaction-form-area': {
        flex: '1',
        overflowX: 'hidden'
      },

      '.__transaction-swap-quote-info-area': {
        flex: '1',
        overflowX: 'hidden'
      }
    },
    '.__switch-side-container': {
      position: 'relative',
      '.__switch-button': {
        position: 'absolute',
        backgroundColor: token['gray-2'],
        borderRadius: '50%',
        alignItems: 'center',
        bottom: -16,
        marginLeft: -20,
        left: '50%',
        display: 'flex',
        justifyContent: 'center'
      }
    }
  };
});

export default Swap;